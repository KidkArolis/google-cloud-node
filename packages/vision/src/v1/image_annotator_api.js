/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * EDITING INSTRUCTIONS
 * This file was generated from the file
 * https://github.com/googleapis/googleapis/blob/master/google/cloud/vision/v1/image_annotator.proto,
 * and updates to that file get reflected here through a refresh process.
 * For the short term, the refresh process will only be runnable by Google
 * engineers.
 *
 * The only allowed edits are to method and file documentation. A 3-way
 * merge preserves those additions if the generated source changes.
 */
/* TODO: introduce line-wrapping so that it never exceeds the limit. */
/* jscs: disable maximumLineLength */
'use strict';

var arguejs = require('arguejs');
var configData = require('./image_annotator_client_config');
var extend = require('extend');
var gax = require('google-gax');

var SERVICE_ADDRESS = 'vision.googleapis.com';

var DEFAULT_SERVICE_PORT = 443;

var CODE_GEN_NAME_VERSION = 'gapic/0.1.0';

var DEFAULT_TIMEOUT = 30;

/**
 * The scopes needed to make gRPC calls to all of the methods defined in
 * this service.
 */
var ALL_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform'
];

/**
 * Service that performs Google Cloud Vision API detection tasks, such as face,
 * landmark, logo, label, and text detection, over client images, and returns
 * detected entities from the images.
 *
 * This will be created through a builder function which can be obtained by the module.
 * See the following example of how to initialize the module and how to access to the builder.
 * @see {@link imageAnnotatorApi}
 *
 * @example
 * var visionV1 = require('@google-cloud/vision').v1({
 *   // optional auth parameters.
 * });
 * var api = visionV1.imageAnnotatorApi();
 *
 * @class
 */
function ImageAnnotatorApi(gaxGrpc, grpcClient, opts) {
  opts = opts || {};
  var servicePath = opts.servicePath || SERVICE_ADDRESS;
  var port = opts.port || DEFAULT_SERVICE_PORT;
  var sslCreds = opts.sslCreds || null;
  var clientConfig = opts.clientConfig || {};
  var timeout = opts.timeout || DEFAULT_TIMEOUT;
  var appName = opts.appName || 'gax';
  var appVersion = opts.appVersion || gax.Version;

  var googleApiClient = [
    appName + '/' + appVersion,
    CODE_GEN_NAME_VERSION,
    'nodejs/' + process.version].join(' ');

  var defaults = gaxGrpc.constructSettings(
      'google.cloud.vision.v1.ImageAnnotator',
      configData,
      clientConfig,
      timeout,
      null,
      null,
      {'x-goog-api-client': googleApiClient});

  var stub = gaxGrpc.createStub(
      servicePath,
      port,
      grpcClient.google.cloud.vision.v1.ImageAnnotator,
      {sslCreds: sslCreds});
  var methods = [
    'batchAnnotateImages'
  ];
  methods.forEach(function(methodName) {
    this['_' + methodName] = gax.createApiCall(
        stub.then(function(stub) { return stub[methodName].bind(stub); }),
        defaults[methodName]);
  }.bind(this));
}

// Service calls

/**
 * Run image detection and annotation for a batch of images.
 *
 * @param {Object[]} requests
 *   Individual image annotation requests for this batch.
 *
 *   This object should have the same structure as [AnnotateImageRequest]{@link AnnotateImageRequest}
 * @param {gax.CallOptions=} options
 *   Overrides the default settings for this call, e.g, timeout,
 *   retries, etc.
 * @param {function(?Error, ?Object)=} callback
 *   The function which will be called with the result of the API call.
 *
 *   The second parameter to the callback is an object representing [BatchAnnotateImagesResponse]{@link BatchAnnotateImagesResponse}
 * @returns {gax.EventEmitter} - the event emitter to handle the call
 *   status.
 *
 * @example
 *
 * var api = visionV1.imageAnnotatorApi();
 * var requests = [];
 * api.batchAnnotateImages(requests, function(err, response) {
 *     if (err) {
 *         console.error(err);
 *         return;
 *     }
 *     // doThingsWith(response)
 * });
 */
ImageAnnotatorApi.prototype.batchAnnotateImages = function batchAnnotateImages() {
  var args = arguejs({
    requests: Array,
    options: [gax.CallOptions],
    callback: [Function]
  }, arguments);
  var req = {
    requests: args.requests
  };
  return this._batchAnnotateImages(req, args.options, args.callback);
};

function ImageAnnotatorApiBuilder(gaxGrpc) {
  if (!(this instanceof ImageAnnotatorApiBuilder)) {
    return new ImageAnnotatorApiBuilder(gaxGrpc);
  }

  var grpcClient = gaxGrpc.load([{
    root: require('google-proto-files')('..'),
    file: 'google/cloud/vision/v1/image_annotator.proto'
  }]);
  extend(this, grpcClient.google.cloud.vision.v1);

  /**
   * Build a new instance of {@link ImageAnnotatorApi}.
   *
   * @param {Object=} opts - The optional parameters.
   * @param {String=} opts.servicePath
   *   The domain name of the API remote host.
   * @param {number=} opts.port
   *   The port on which to connect to the remote host.
   * @param {grpc.ClientCredentials=} opts.sslCreds
   *   A ClientCredentials for use with an SSL-enabled channel.
   * @param {Object=} opts.clientConfig
   *   The customized config to build the call settings. See
   *   {@link gax.constructSettings} for the format.
   * @param {number=} opts.timeout
   *   The default timeout, in seconds, for calls made through this client.
   * @param {number=} opts.appName
   *   The codename of the calling service.
   * @param {String=} opts.appVersion
   *   The version of the calling service.
   */
  this.imageAnnotatorApi = function(opts) {
    return new ImageAnnotatorApi(gaxGrpc, grpcClient, opts);
  };
  extend(this.imageAnnotatorApi, ImageAnnotatorApi);
}
module.exports = ImageAnnotatorApiBuilder;
module.exports.SERVICE_ADDRESS = SERVICE_ADDRESS;
module.exports.ALL_SCOPES = ALL_SCOPES;