/**
 * Copyright 2014 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var assert = require('assert');
var extend = require('extend');
var is = require('is');
var proxyquire = require('proxyquire');
var stream = require('stream');
var through = require('through2');
var util = require('@google-cloud/common').util;

var entity = require('../src/entity.js');
var Query = require('../src/query.js');

var overrides = {};

function override(name, object) {
  var cachedObject = extend({}, object);
  overrides[name] = {};

  Object.keys(object).forEach(function(methodName) {
    if (typeof object[methodName] !== 'function') {
      return;
    }

    object[methodName] = function() {
      var args = arguments;

      if (overrides[name][methodName]) {
        return overrides[name][methodName].apply(this, args);
      }

      return cachedObject[methodName].apply(this, args);
    };
  });
}

function resetOverrides() {
  overrides = Object.keys(overrides).reduce(function(acc, name) {
    acc[name] = {};
    return acc;
  }, {});
}

override('entity', entity);
override('util', util);

function FakeQuery() {
  this.calledWith_ = arguments;
}

describe('Request', function() {
  var Request;
  var request;

  var key;

  before(function() {
    Request = proxyquire('../src/request.js', {
      '@google-cloud/common': {
        util: util
      },
      './entity.js': entity,
      './query.js': FakeQuery
    });
  });

  after(function() {
    resetOverrides();
  });

  beforeEach(function() {
    key = new entity.Key({
      namespace: 'namespace',
      path: ['Company', 123]
    });
    FakeQuery.prototype = new Query();
    resetOverrides();
    request = new Request();
  });

  describe('allocateIds', function() {
    var incompleteKey;
    var apiResponse = {
      keys: [
        { path: [{ kind: 'Kind', id: 123 }] }
      ]
    };

    beforeEach(function() {
      incompleteKey = new entity.Key({ namespace: null, path: ['Kind'] });
    });

    it('should produce proper allocate IDs req protos', function(done) {
      request.request_ = function(protoOpts, reqOpts, callback) {
        assert.strictEqual(protoOpts.service, 'Datastore');
        assert.strictEqual(protoOpts.method, 'allocateIds');

        assert.equal(reqOpts.keys.length, 1);

        callback(null, apiResponse);
      };

      request.allocateIds(incompleteKey, 1, function(err, keys) {
        assert.ifError(err);
        var generatedKey = keys[0];
        assert.strictEqual(generatedKey.path.pop(), 123);
        done();
      });
    });

    it('should exec callback with error & API response', function(done) {
      var error = new Error('Error.');

      request.request_ = function(protoOpts, reqOpts, callback) {
        callback(error, apiResponse);
      };

      request.allocateIds(incompleteKey, 1, function(err, keys, apiResponse_) {
        assert.strictEqual(err, error);
        assert.strictEqual(keys, null);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });

    it('should return apiResponse in callback', function(done) {
      request.request_ = function(protoOpts, reqOpts, callback) {
        callback(null, apiResponse);
      };

      request.allocateIds(incompleteKey, 1, function(err, keys, apiResponse_) {
        assert.ifError(err);
        assert.strictEqual(apiResponse_, apiResponse);
        done();
      });
    });

    it('should throw if trying to allocate IDs with complete keys', function() {
      assert.throws(function() {
        request.allocateIds(key);
      });
    });
  });

  describe('delete', function() {
    it('should delete by key', function(done) {
      request.request_ = function(protoOpts, reqOpts, callback) {
        assert.strictEqual(protoOpts.service, 'Datastore');
        assert.strictEqual(protoOpts.method, 'commit');
        assert(is.object(reqOpts.mutations[0].delete));
        callback();
      };
      request.delete(key, done);
    });

    it('should return apiResponse in callback', function(done) {
      var resp = { success: true };
      request.request_ = function(protoOpts, reqOpts, callback) {
        callback(null, resp);
      };
      request.delete(key, function(err, apiResponse) {
        assert.ifError(err);
        assert.deepEqual(resp, apiResponse);
        done();
      });
    });

    it('should multi delete by keys', function(done) {
      request.request_ = function(protoOpts, reqOpts, callback) {
        assert.equal(reqOpts.mutations.length, 2);
        callback();
      };
      request.delete([ key, key ], done);
    });

    describe('transactions', function() {
      beforeEach(function() {
        // Trigger transaction mode.
        request.id = 'transaction-id';
        request.requests_ = [];
      });

      it('should queue request', function() {
        request.delete(key);

        assert(is.object(request.requests_[0].mutations[0].delete));
      });
    });
  });

  describe('get', function() {
    beforeEach(function() {
      request.request_ = function() {};

      overrides.util.createLimiter = function(makeRequest) {
        var transformStream = new stream.Transform({ objectMode: true });
        transformStream.destroy = through.obj().destroy.bind(transformStream);

        setImmediate(function() {
          transformStream.emit('reading');
        });

        return {
          makeRequest: makeRequest,
          stream: transformStream
        };
      };
    });

    it('should throw if no keys are provided', function() {
      assert.throws(function() {
        request.get();
      }, /At least one Key object is required/);
    });

    it('should return a stream if no callback is provided', function() {
      assert(request.get(key) instanceof stream);
    });

    it('should convert key to key proto', function(done) {
      overrides.entity.keyToKeyProto = function(key_) {
        assert.strictEqual(key_, key);
        done();
      };

      request.get(key, assert.ifError);
    });

    it('should create a limiter', function(done) {
      var options = {};

      overrides.util.createLimiter = function(makeRequest, options_) {
        assert.strictEqual(options_, options);

        setImmediate(done);

        return {
          makeRequest: makeRequest,
          stream: through()
        };
      };

      request.get(key, options, assert.ifError);
    });

    it('should make correct request', function(done) {
      request.request_ = function(protoOpts, reqOpts) {
        assert.strictEqual(protoOpts.service, 'Datastore');
        assert.strictEqual(protoOpts.method, 'lookup');

        assert.deepEqual(reqOpts.keys[0], entity.keyToKeyProto(key));

        done();
      };

      request.get(key, assert.ifError);
    });

    it('should allow setting strong read consistency', function(done) {
      request.request_ = function(protoOpts, reqOpts) {
        assert.strictEqual(reqOpts.readOptions.readConsistency, 1);
        done();
      };

      request.get(key, { consistency: 'strong' }, assert.ifError);
    });

    it('should allow setting strong eventual consistency', function(done) {
      request.request_ = function(protoOpts, reqOpts) {
        assert.strictEqual(reqOpts.readOptions.readConsistency, 2);
        done();
      };

      request.get(key, { consistency: 'eventual' }, assert.ifError);
    });

    describe('error', function() {
      var error = new Error('Error.');
      var apiResponse = { a: 'b', c: 'd' };

      beforeEach(function() {
        request.request_ = function(protoOpts, reqOpts, callback) {
          setImmediate(function() {
            callback(error, apiResponse);
          });
        };
      });

      describe('callback mode', function() {
        it('should execute callback with error', function(done) {
          request.get(key, function(err) {
            assert.strictEqual(err, error);
            done();
          });
        });
      });

      describe('stream mode', function() {
        it('should emit error', function(done) {
          request.get(key)
            .on('data', util.noop)
            .on('error', function(err) {
              assert.strictEqual(err, error);
              done();
            });
        });

        it('should end stream', function(done) {
          var stream = request.get(key);

          stream
            .on('data', util.noop)
            .on('error', function() {
              setImmediate(function() {
                assert.strictEqual(stream._destroyed, true);
                done();
              });
            });
        });
      });
    });

    describe('success', function() {
      var apiResponse = {
        found: [
          {
            entity: {
              key: {
                partitionId: {
                  projectId: 'grape-spaceship-123'
                },
                path: [
                  {
                    kind: 'Post',
                    name: 'post1'
                  }
                ]
              },
              properties: {
                title: {
                  stringValue: 'How to make the perfect pizza in your grill'
                },
                tags: {
                  arrayValue: {
                    values: [
                      {
                        stringValue: 'pizza'
                      },
                      {
                        stringValue: 'grill'
                      }
                    ]
                  }
                },
                rating: {
                  integerValue: '5'
                },
                author: {
                  stringValue: 'Silvano'
                },
                wordCount: {
                  integerValue: '400'
                },
                isDraft: {
                  booleanValue: false
                }
              }
            }
          }
        ]
      };

      var expectedResult = entity.formatArray(apiResponse.found)[0];

      var apiResponseWithMultiEntities = extend(true, {}, apiResponse);
      var entities = apiResponseWithMultiEntities.found;
      entities.push(entities[0]);
      var expectedResults = entity.formatArray(entities);

      var apiResponseWithDeferred = extend(true, {}, apiResponse);
      apiResponseWithDeferred.deferred = [
        apiResponseWithDeferred.found[0].entity.key
      ];

      beforeEach(function() {
        request.request_ = function(protoOpts, reqOpts, callback) {
          callback(null, apiResponse);
        };
      });

      it('should format the results', function(done) {
        overrides.entity.formatArray = function(arr) {
          assert.strictEqual(arr, apiResponse.found);
          setImmediate(done);
          return arr;
        };

        request.get(key, assert.ifError);
      });

      it('should continue looking for deferred results', function(done) {
        var numTimesCalled = 0;

        request.request_ = function(protoOpts, reqOpts, callback) {
          numTimesCalled++;

          if (numTimesCalled === 1) {
            callback(null, apiResponseWithDeferred);
            return;
          }

          var expectedKeys = apiResponseWithDeferred.deferred
            .map(entity.keyFromKeyProto)
            .map(entity.keyToKeyProto);

          assert.deepEqual(reqOpts.keys, expectedKeys);
          done();
        };

        request.get(key, assert.ifError);
      });

      describe('callback mode', function() {
        it('should exec callback with results', function(done) {
          request.get(key, function(err, entity) {
            assert.ifError(err);
            assert.deepEqual(entity, expectedResult);
            done();
          });
        });

        it('should exec callback w/ array from multiple keys', function(done) {
          request.request_ = function(protoOpts, reqOpts, callback) {
            callback(null, apiResponseWithMultiEntities);
          };

          request.get([key, key], function(err, entities) {
            assert.ifError(err);

            assert.strictEqual(is.array(entities), true);
            assert.deepEqual(entities, expectedResults);

            done();
          });
        });
      });

      describe('stream mode', function() {
        beforeEach(function() {
          overrides.util.createLimiter = function(makeRequest) {
            return {
              makeRequest: makeRequest,
              stream: new stream.Transform({ objectMode: true })
            };
          };
        });

        it('should push results to the stream', function(done) {
          request.get(key)
            .on('error', done)
            .on('data', function(entity) {
              assert.deepEqual(entity, expectedResult);
            })
            .on('end', done)
            .emit('reading');
        });

        it('should not push more results if stream was ended', function(done) {
          var entitiesEmitted = 0;

          request.request_ = function(protoOpts, reqOpts, callback) {
            setImmediate(function() {
              callback(null, apiResponseWithMultiEntities);
            });
          };

          request.get([key, key])
            .on('data', function() {
              entitiesEmitted++;
              this.end();
            })
            .on('end', function() {
              assert.strictEqual(entitiesEmitted, 1);
              done();
            })
            .emit('reading');
        });

        it('should not get more results if stream was ended', function(done) {
          var lookupCount = 0;

          request.request_ = function(protoOpts, reqOpts, callback) {
            lookupCount++;
            setImmediate(function() {
              callback(null, apiResponseWithDeferred);
            });
          };

          request.get(key)
            .on('error', done)
            .on('data', function() {
              this.end();
            })
            .on('end', function() {
              assert.strictEqual(lookupCount, 1);
              done();
            })
            .emit('reading');
        });
      });
    });
  });

  describe('insert', function() {
    it('should pass the correct arguments to save', function(done) {
      request.save = function(entities, callback) {
        assert.deepEqual(entities, [{
          key: {
            namespace: 'ns',
            kind: 'Company',
            path: ['Company', undefined],
          },
          data: {},
          method: 'insert'
        }]);

        callback();
      };

      var key = new entity.Key({ namespace: 'ns', path: ['Company'] });
      request.insert({ key: key, data: {} }, done);
    });
  });

  describe('runQuery', function() {
    beforeEach(function() {
      overrides.entity.queryToQueryProto = util.noop;
      request.request_ = util.noop;

      overrides.util.createLimiter = function(makeRequest) {
        var transformStream = new stream.Transform({ objectMode: true });
        transformStream.destroy = through.obj().destroy.bind(transformStream);

        setImmediate(function() {
          transformStream.emit('reading');
        });

        return {
          makeRequest: makeRequest,
          stream: transformStream
        };
      };
    });

    it('should return a stream if no callback is provided', function() {
      assert(request.runQuery({}) instanceof stream);
    });

    it('should create a limiter', function(done) {
      var options = {};

      overrides.util.createLimiter = function(makeRequest, options_) {
        assert.strictEqual(options_, options);

        setImmediate(done);

        return {
          makeRequest: makeRequest,
          stream: through()
        };
      };

      request.runQuery({}, options, assert.ifError);
    });

    it('should make correct request', function(done) {
      var query = { namespace: 'namespace' };
      var queryProto = {};

      overrides.entity.queryToQueryProto = function(query_) {
        assert.strictEqual(query_, query);
        return queryProto;
      };

      request.request_ = function(protoOpts, reqOpts) {
        assert.strictEqual(protoOpts.service, 'Datastore');
        assert.strictEqual(protoOpts.method, 'runQuery');
        assert(is.empty(reqOpts.readOptions));
        assert.strictEqual(reqOpts.query, queryProto);
        assert.strictEqual(reqOpts.partitionId.namespaceId, query.namespace);

        done();
      };

      request.runQuery(query, assert.ifError);
    });

    it('should allow setting strong read consistency', function(done) {
      request.request_ = function(protoOpts, reqOpts) {
        assert.strictEqual(reqOpts.readOptions.readConsistency, 1);
        done();
      };

      request.runQuery({}, { consistency: 'strong' }, assert.ifError);
    });

    it('should allow setting strong eventual consistency', function(done) {
      request.request_ = function(protoOpts, reqOpts) {
        assert.strictEqual(reqOpts.readOptions.readConsistency, 2);
        done();
      };

      request.runQuery({}, { consistency: 'eventual' }, assert.ifError);
    });

    describe('error', function() {
      var error = new Error('Error.');

      beforeEach(function() {
        request.request_ = function(protoOpts, reqOpts, callback) {
          callback(error);
        };
      });

      it('should execute callback with error', function(done) {
        request.runQuery({}, function(err) {
          assert.strictEqual(err, error);
          done();
        });
      });

      it('should emit error on a stream', function(done) {
        request.runQuery({})
          .on('error', function(err) {
            assert.strictEqual(err, error);
            done();
          });
      });
    });

    describe('success', function() {
      var entityResultsPerApiCall = {
        1: [{ a: true }],
        2: [{ b: true }, { c: true }]
      };

      var apiResponse = {
        batch: {
          entityResults: [{ a: true }, { b: true }, { c: true }],
          endCursor: new Buffer('abc'),
          moreResults: 'MORE_RESULTS_AFTER_LIMIT',
          skippedResults: 0
        }
      };

      beforeEach(function() {
        request.request_ = function(protoOpts, reqOpts, callback) {
          callback(null, apiResponse);
        };

        overrides.entity.formatArray = function(array) {
          return array;
        };
      });

      it('should format results', function(done) {
        overrides.entity.formatArray = function(array) {
          assert.strictEqual(array, apiResponse.batch.entityResults);
          return array;
        };

        request.runQuery({}, function(err, entities) {
          assert.ifError(err);
          assert.deepEqual(entities, apiResponse.batch.entityResults);
          done();
        });
      });

      it('should re-run query if not finished', function(done) {
        var continuationQuery;
        var query = {
          limitVal: 1,
          offsetVal: 8
        };
        var queryProto = {
          limit: {
            value: query.limitVal
          }
        };

        var timesRequestCalled = 0;
        var startCalled = false;
        var offsetCalled = false;

        overrides.entity.formatArray = function(array) {
          assert.strictEqual(
            array,
            entityResultsPerApiCall[timesRequestCalled]
          );
          return entityResultsPerApiCall[timesRequestCalled];
        };

        request.request_ = function(protoOpts, reqOpts, callback) {
          timesRequestCalled++;

          var resp = extend(true, {}, apiResponse);
          resp.batch.entityResults =
            entityResultsPerApiCall[timesRequestCalled];

          if (timesRequestCalled === 1) {
            assert.strictEqual(protoOpts.service, 'Datastore');
            assert.strictEqual(protoOpts.method, 'runQuery');

            resp.batch.moreResults = 'NOT_FINISHED';

            callback(null, resp);
          } else {
            assert.strictEqual(startCalled, true);
            assert.strictEqual(offsetCalled, true);
            assert.strictEqual(reqOpts.query, queryProto);

            resp.batch.moreResults = 'MORE_RESULTS_AFTER_LIMIT';

            callback(null, resp);
          }
        };

        FakeQuery.prototype.start = function(endCursor) {
          assert.strictEqual(endCursor, apiResponse.batch.endCursor);
          startCalled = true;
          return this;
        };

        FakeQuery.prototype.offset = function(offset_) {
          var offset = query.offsetVal - apiResponse.batch.skippedResults;
          assert.strictEqual(offset_, offset);
          offsetCalled = true;
          return this;
        };

        FakeQuery.prototype.limit = function(limit_) {
          if (timesRequestCalled === 1) {
            assert.strictEqual(
              limit_,
              entityResultsPerApiCall[1].length - query.limitVal
            );
          } else {
            // Should restore the original limit.
            assert.strictEqual(limit_, query.limitVal);
          }
          return this;
        };

        overrides.entity.queryToQueryProto = function(query_) {
          if (timesRequestCalled > 1) {
            assert.strictEqual(query_, continuationQuery);
          }
          return queryProto;
        };

        request.runQuery(query, function(err, entities, info) {
          assert.ifError(err);

          var allResults = [].slice.call(entityResultsPerApiCall[1])
            .concat(entityResultsPerApiCall[2]);
          assert.deepEqual(entities, allResults);

          assert.deepEqual(info, {
            endCursor: apiResponse.batch.endCursor,
            moreResults: apiResponse.batch.moreResults
          });

          done();
        });
      });

      it('should handle large limitless queries', function(done) {
        var timesRequestCalled = 0;
        var limitCalled = false;

        var query = {
          limitVal: -1
        };

        request.request_ = function(protoOpts, reqOpts, callback) {
          var batch;

          if (++timesRequestCalled === 2) {
            batch = {};
          } else {
            batch = {
              moreResults: 'NOT_FINISHED',
              endCursor: new Buffer('abc')
            };
          }

          callback(null, { batch: batch });
        };

        overrides.entity.queryToQueryProto = function() {
          return {};
        };

        FakeQuery.prototype.limit = function() {
          limitCalled = true;
          return this;
        };

        request.runQuery(query, function(err) {
          assert.ifError(err);
          assert.strictEqual(timesRequestCalled, 2);
          assert.strictEqual(limitCalled, false);
          done();
        });
      });

      it('should emit the info object on a stream', function(done) {
        request.runQuery({})
          .on('error', done)
          .on('info', function(info) {
            assert.deepEqual(info, {
              endCursor: apiResponse.batch.endCursor,
              moreResults: apiResponse.batch.moreResults
            });
            done();
          });
      });

      it('should not push more results if stream was ended', function(done) {
        var timesRequestCalled = 0;
        var entitiesEmitted = 0;

        request.request_ = function(protoOpts, reqOpts, callback) {
          timesRequestCalled++;

          var resp = extend(true, {}, apiResponse);
          resp.batch.entityResults =
            entityResultsPerApiCall[timesRequestCalled];

          if (timesRequestCalled === 1) {
            resp.batch.moreResults = 'NOT_FINISHED';
            callback(null, resp);
          } else {
            resp.batch.moreResults = 'MORE_RESULTS_AFTER_LIMIT';
            callback(null, resp);
          }
        };

        request.runQuery({})
          .on('data', function() {
            entitiesEmitted++;
            this.end();
          })
          .on('end', function() {
            assert.strictEqual(entitiesEmitted, 1);
            done();
          });
      });

      it('should not get more results if stream was ended', function(done) {
        var timesRequestCalled = 0;

        request.request_ = function(protoOpts, reqOpts, callback) {
          timesRequestCalled++;
          callback(null, apiResponse);
        };

        request.runQuery({})
          .on('error', done)
          .on('data', function() {
            this.end();
          })
          .on('end', function() {
            assert.strictEqual(timesRequestCalled, 1);
            done();
          });
      });
    });
  });

  describe('save', function() {
    it('should save with keys', function(done) {
      var expectedReq = {
        mutations: [
          {
            upsert: {
              key: {
                partitionId: {
                  namespaceId: 'namespace'
                },
                path: [
                  {
                    kind: 'Company',
                    id: 123
                  }
                ]
              },
              properties: {
                k: {
                  stringValue: 'v'
                }
              }
            }
          },
          {
            upsert: {
              key: {
                partitionId: {
                  namespaceId: 'namespace'
                },
                path: [
                  {
                    kind: 'Company',
                    id: 123
                  }
                ]
              },
              properties: {
                k: {
                  stringValue: 'v'
                }
              }
            }
          }
        ]
      };

      request.request_ = function(protoOpts, reqOpts, callback) {
        assert.strictEqual(protoOpts.service, 'Datastore');
        assert.strictEqual(protoOpts.method, 'commit');

        assert.deepEqual(reqOpts, expectedReq);

        callback();
      };
      request.save([
        { key: key, data: { k: 'v' } },
        { key: key, data: { k: 'v' } }
      ], done);
    });

    it('should save with specific method', function(done) {
      request.request_ = function(protoOpts, reqOpts, callback) {
        assert.equal(reqOpts.mutations.length, 3);
        assert(is.object(reqOpts.mutations[0].insert));
        assert(is.object(reqOpts.mutations[1].update));
        assert(is.object(reqOpts.mutations[2].upsert));

        var insert = reqOpts.mutations[0].insert;
        assert.deepEqual(insert.properties.k, { stringValue: 'v' });

        var update = reqOpts.mutations[1].update;
        assert.deepEqual(update.properties.k2, { stringValue: 'v2' });

        var upsert = reqOpts.mutations[2].upsert;
        assert.deepEqual(upsert.properties.k3, { stringValue: 'v3' });

        callback();
      };

      request.save([
        { key: key, method: 'insert', data: { k: 'v' } },
        { key: key, method: 'update', data: { k2: 'v2' } },
        { key: key, method: 'upsert', data: { k3: 'v3' } }
      ], done);
    });

    it('should throw if a given method is not recognized', function() {
      assert.throws(function() {
        request.save({
          key: key,
          method: 'auto_insert_id',
          data: {
            k: 'v'
          }
        }, assert.ifError);
      }, /Method auto_insert_id not recognized/);
    });

    it('should not alter the provided data object', function(done) {
      var entities = [
        {
          key: key,
          method: 'insert',
          indexed: false,
          data: {
            value: {
              a: 'b',
              c: [1, 2, 3]
            }
          }
        }
      ];
      var expectedEntities = extend(true, {}, entities);

      request.request_ = function() {
        // By the time the request is made, the original object has already been
        // transformed into a raw request.
        assert.deepEqual(entities, expectedEntities);
        done();
      };

      request.save(entities, assert.ifError);
    });

    it('should return apiResponse in callback', function(done) {
      var key = new entity.Key({ namespace: 'ns', path: ['Company'] });
      var mockCommitResponse = {};
      request.request_ = function(protoOpts, reqOpts, callback) {
        callback(null, mockCommitResponse);
      };
      request.save({ key: key, data: {} }, function(err, apiResponse) {
        assert.ifError(err);
        assert.strictEqual(mockCommitResponse, apiResponse);
        done();
      });
    });

    it('should allow setting the indexed value of a property', function(done) {
      request.request_ = function(protoOpts, reqOpts) {
        var property = reqOpts.mutations[0].upsert.properties.name;
        assert.strictEqual(property.stringValue, 'value');
        assert.strictEqual(property.excludeFromIndexes, true);
        done();
      };

      request.save({
        key: key,
        data: [
          {
            name: 'name',
            value: 'value',
            excludeFromIndexes: true
          }
        ]
      }, assert.ifError);
    });

    it('should allow setting the indexed value on arrays', function(done) {
      request.request_ = function(protoOpts, reqOpts) {
        var property = reqOpts.mutations[0].upsert.properties.name;

        property.arrayValue.values.forEach(function(value) {
          assert.strictEqual(value.excludeFromIndexes, true);
        });

        done();
      };

      request.save({
        key: key,
        data: [
          {
            name: 'name',
            value: ['one', 'two', 'three'],
            excludeFromIndexes: true
          }
        ]
      }, assert.ifError);
    });

    it('should assign ID on keys without them', function(done) {
      var incompleteKey = new entity.Key({ path: ['Incomplete'] });
      var incompleteKey2 = new entity.Key({ path: ['Incomplete'] });
      var completeKey = new entity.Key({ path: ['Complete', 'Key'] });

      var keyProtos = [];
      var ids = [1, 2];

      var response = {
        mutationResults: [
          {
            key: {}
          },
          {
            key: {}
          },
          {}
        ]
      };

      request.request_ = function(protoOpts, reqOpts, callback) {
        callback(null, response);
      };

      overrides.entity.keyFromKeyProto = function(keyProto) {
        keyProtos.push(keyProto);
        return {
          id: ids[keyProtos.length - 1]
        };
      };

      request.save([
        { key: incompleteKey, data: {} },
        { key: incompleteKey2, data: {} },
        { key: completeKey, data: {} }
      ], function(err) {
        assert.ifError(err);

        assert.strictEqual(incompleteKey.id, ids[0]);
        assert.strictEqual(incompleteKey2.id, ids[1]);

        assert.strictEqual(keyProtos.length, 2);
        assert.strictEqual(keyProtos[0], response.mutationResults[0].key);
        assert.strictEqual(keyProtos[1], response.mutationResults[1].key);

        done();
      });
    });

    describe('transactions', function() {
      beforeEach(function() {
        // Trigger transaction mode.
        request.id = 'transaction-id';
        request.requestCallbacks_ = [];
        request.requests_ = [];
      });

      it('should queue request & callback', function() {
        request.save({
          key: key,
          data: [{ name: 'name', value: 'value' }]
        });

        assert.equal(typeof request.requestCallbacks_[0], 'function');
        assert.equal(typeof request.requests_[0], 'object');
      });
    });
  });

  describe('update', function() {
    it('should pass the correct arguments to save', function(done) {
      request.save = function(entities, callback) {
        assert.deepEqual(entities, [{
          key: {
            namespace: 'ns',
            kind: 'Company',
            path: ['Company', undefined],
          },
          data: {},
          method: 'update'
        }]);

        callback();
      };

      var key = new entity.Key({ namespace: 'ns', path: ['Company'] });
      request.update({ key: key, data: {} }, done);
    });
  });

  describe('upsert', function() {
    it('should pass the correct arguments to save', function(done) {
      request.save = function(entities, callback) {
        assert.deepEqual(entities, [{
          key: {
            namespace: 'ns',
            kind: 'Company',
            path: ['Company', undefined],
          },
          data: {},
          method: 'upsert'
        }]);

        callback();
      };

      var key = new entity.Key({ namespace: 'ns', path: ['Company'] });
      request.upsert({ key: key, data: {} }, done);
    });
  });

  describe('request_', function() {
    var PROJECT_ID = 'project-id';
    var PROTO_OPTS = {};

    beforeEach(function() {
      request.projectId = PROJECT_ID;
    });

    it('should not require reqOpts', function(done) {
      request.request = function(protoOpts, reqOpts, callback) {
        callback(); // done()
      };

      request.request_(PROTO_OPTS, done);
    });

    it('should make the correct request', function(done) {
      var reqOpts = {};

      request.request = function(protoOpts, reqOpts_) {
        assert.strictEqual(protoOpts, PROTO_OPTS);
        assert.strictEqual(reqOpts_, reqOpts);
        assert.strictEqual(reqOpts_.projectId, PROJECT_ID);
        done();
      };

      request.request_(PROTO_OPTS, reqOpts, assert.ifError);
    });

    describe('commit', function() {
      it('should set the mode', function(done) {
        var reqOpts = {};

        request.request = function(protoOpts, reqOpts_) {
          assert.strictEqual(reqOpts_, reqOpts);
          assert.strictEqual(reqOpts_.mode, 'NON_TRANSACTIONAL');
          done();
        };

        request.request_({ method: 'commit' }, reqOpts, assert.ifError);
      });
    });

    describe('transaction', function() {
      var TRANSACTION_ID = 'transaction';

      beforeEach(function() {
        request.id = TRANSACTION_ID;
      });

      it('should set the commit transaction info', function(done) {
        var reqOpts = {};

        request.request = function(protoOpts, reqOpts_) {
          assert.strictEqual(reqOpts_, reqOpts);
          assert.strictEqual(reqOpts_.mode, 'TRANSACTIONAL');
          assert.strictEqual(reqOpts_.transaction, request.id);
          done();
        };

        request.id = 'transaction-id';
        request.request_({ method: 'commit' }, reqOpts, assert.ifError);
      });

      it('should set the rollback transaction info', function(done) {
        var reqOpts = {};

        request.request = function(protoOpts, reqOpts_) {
          assert.strictEqual(reqOpts_, reqOpts);
          assert.strictEqual(reqOpts_.transaction, request.id);
          done();
        };

        request.id = 'transaction-id';
        request.request_({ method: 'rollback' }, reqOpts, assert.ifError);
      });

      it('should set the lookup transaction info', function(done) {
        var reqOpts = {
          readOptions: {}
        };

        request.request = function(protoOpts, reqOpts_) {
          assert.strictEqual(reqOpts_, reqOpts);
          assert.strictEqual(reqOpts_.readOptions, reqOpts.readOptions);
          assert.strictEqual(reqOpts_.readOptions.transaction, request.id);
          done();
        };

        request.id = 'transaction-id';
        request.request_({ method: 'lookup' }, reqOpts, assert.ifError);
      });

      it('should set the lookup transaction info', function(done) {
        var reqOpts = {
          readOptions: {}
        };

        request.request = function(protoOpts, reqOpts_) {
          assert.strictEqual(reqOpts_, reqOpts);
          assert.strictEqual(reqOpts_.readOptions, reqOpts.readOptions);
          assert.strictEqual(reqOpts_.readOptions.transaction, request.id);
          done();
        };

        request.id = 'transaction-id';
        request.request_({ method: 'runQuery' }, reqOpts, assert.ifError);
      });

      it('should throw if read consistency is specified', function() {
        var reqOpts = {
          readOptions: {
            readConsistency: 1
          }
        };

        request.id = 'transaction-id';

        assert.throws(function() {
          request.request_({ method: 'runQuery' }, reqOpts, assert.ifError);
        }, /Read consistency cannot be specified in a transaction\./);
      });
    });
  });
});
