var Integration = require("../helpers/integration");
var Collections = require("utils/collections");
var transports = require("transports/transports").default;
var util = require("util").default;
var Runtime = require('runtimes/runtime').default;
var Dependencies = require('runtimes/dom/dependencies').Dependencies;
var DependenciesReceivers = require('runtimes/dom/dependencies').DependenciesReceivers;
var Defaults = require('defaults');
var DependencyLoader = require('runtimes/dom/dependency_loader').default;

Integration.describe("Cluster Configuration", function() {

  var TRANSPORTS = {
    "ws": transports.WSTransport,
    "sockjs": transports.SockJSTransport,
    "xhr_streaming": transports.XHRStreamingTransport,
    "xhr_polling": transports.XHRPollingTransport,
    "xdr_streaming": transports.XDRStreamingTransport,
    "xdr_polling": transports.XDRPollingTransport
  };

  function subscribe(pusher, channelName, callback) {
    var channel = pusher.subscribe(channelName);
    channel.bind("pusher:subscription_succeeded", function(param) {
      callback(channel, param);
    });
    return channel;
  }

  var pusher;

  function describeClusterTest(options) {
    var environment = { encrypted: options.encrypted };
    if (!TRANSPORTS[options.transport].isSupported(environment)) {
      return;
    }

    describe("with " + options.transport + ", encrypted=" + options.encrypted, function() {
      beforeEach(function() {
        Collections.objectApply(TRANSPORTS, function(transport, name) {
          spyOn(transport, "isSupported").andReturn(false);
        });
        TRANSPORTS[options.transport].isSupported.andReturn(true);
        spyOn(Runtime, "getLocalStorage").andReturn({});
      });

      it("should open a connection to the 'eu' cluster", function() {
        pusher = new Pusher("4d31fbea7080e3b4bf6d", {
          authTransport: 'jsonp',
          authEndpoint: Integration.API_EU_URL + "/auth",
          cluster: "eu",
          encrypted: options.encrypted,
          disableStats: true
        });
        waitsFor(function() {
          return pusher.connection.state === "connected";
        }, "connection to be established", 20000);
      });

      it("should subscribe and receive a message sent via REST API", function() {
        var channelName = Integration.getRandomName("private-integration");

        var onSubscribed = jasmine.createSpy("onSubscribed");
        var channel = subscribe(pusher, channelName, onSubscribed);

        var eventName = "integration_event";
        var data = { x: 1, y: "z" };
        var received = null;

        waitsFor(function() {
          return onSubscribed.calls.length;
        }, "subscription to succeed", 10000);
        runs(function() {
          channel.bind(eventName, function(message) {
            received = message;
          });
          Integration.sendAPIMessage({
            url: Integration.API_EU_URL + "/v2/send",
            channel: channelName,
            event: eventName,
            data: data
          });
        });
        waitsFor(function() {
          return received !== null;
        }, "message to get delivered", 10000);
        runs(function() {
          expect(received).toEqual(data);
          pusher.unsubscribe(channelName);
        });
      });

      it("should disconnect the connection", function() {
        pusher.disconnect();
      });
    });
  }

  var _VERSION;
  var _channel_auth_transport;
  var _channel_auth_endpoint;
  var _Dependencies;

  it("should prepare the global config", function() {
    // TODO fix how versions work in unit tests
    _VERSION = Defaults.VERSION;
    _channel_auth_transport = Defaults.channel_auth_transport;
    _channel_auth_endpoint = Defaults.channel_auth_endpoint;
    _Dependencies = Dependencies;

    Defaults.VERSION = "8.8.8";
    Defaults.channel_auth_transport = "";
    Defaults.channel_auth_endpoint = "";
    Dependencies = new DependencyLoader({
      cdn_http: Integration.JS_HOST,
      cdn_https: Integration.JS_HOST,
      version: Defaults.VERSION,
      suffix: "",
      receivers: DependenciesReceivers
    });
  });

  if (!/version\/5.*safari/i.test(navigator.userAgent)) {
    // Safari 5 uses hixie-75/76, which is not supported on EU
    describeClusterTest({ transport: "ws", encrypted: false});
    describeClusterTest({ transport: "ws", encrypted: true});
  }

  if (Runtime.isXHRSupported()) {
    // CORS-compatible browsers
    if (!/Android 2\./i.test(navigator.userAgent)) {
      // Android 2.x does a lot of buffering, which kills streaming
      describeClusterTest({ transport: "xhr_streaming", encrypted: false});
      describeClusterTest({ transport: "xhr_streaming", encrypted: true});
    }
    describeClusterTest({ transport: "xhr_polling", encrypted: false});
    describeClusterTest({ transport: "xhr_polling", encrypted: true});
  } else if (Runtime.isXDRSupported(false)) {
    describeClusterTest({ transport: "xdr_streaming", encrypted: false});
    describeClusterTest({ transport: "xdr_streaming", encrypted: true});
    describeClusterTest({ transport: "xdr_polling", encrypted: false});
    describeClusterTest({ transport: "xdr_polling", encrypted: true});
    // IE can fall back to SockJS if protocols don't match
    // No SockJS encrypted tests due to the way JS files are served
    describeClusterTest({ transport: "sockjs", encrypted: false});
  } else {
    // Browsers using SockJS
    describeClusterTest({ transport: "sockjs", encrypted: false});
    describeClusterTest({ transport: "sockjs", encrypted: true});
  }
});
