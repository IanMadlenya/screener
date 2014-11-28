// dispatch.js
/* 
 *  Copyright (c) 2014 James Leigh, Some Rights Reserved
 * 
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions are met:
 * 
 *  1. Redistributions of source code must retain the above copyright notice,
 *  this list of conditions and the following disclaimer.
 * 
 *  2. Redistributions in binary form must reproduce the above copyright
 *  notice, this list of conditions and the following disclaimer in the
 *  documentation and/or other materials provided with the distribution.
 * 
 *  3. Neither the name of the copyright holder nor the names of its
 *  contributors may be used to endorse or promote products derived from this
 *  software without specific prior written permission.
 * 
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 *  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 *  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 *  ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 *  LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 *  CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 *  SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 *  INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 *  CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */

function dispatch(handler){
    self.addEventListener("connect", function(event) {
        event.ports[0].onmessage = function(event) {
            var cmd = event.data.cmd || event.data;
            if (typeof cmd == 'string' && typeof handler[cmd] == 'function') {
                Promise.resolve(event).then(handler[cmd]).then(function(result){
                    if (_.isObject(result) && result.status && _.isObject(event.data)) {
                        event.ports[0].postMessage(_.extend(_.omit(event.data, 'points', 'result'), result));
                    } else if (result !== undefined) {
                        event.ports[0].postMessage(result);
                    }
                }).catch(function(error) {
                    if (error.status != 'error' || error.message) {
                        console.log(error);
                    }
                    return Promise.reject(normalizedError(error));
                }).catch(function(error){
                    var clone = _.isString(event.data) ? {cmd: event.data} : _.omit(event.data, 'points', 'result');
                    event.ports[0].postMessage(_.extend(clone, error));
                });
            } else if (event.ports && event.ports.length) {
                console.log('Unknown command ' + cmd);
                event.ports[0].postMessage({
                    status: 'error',
                    message: 'Unknown command ' + cmd
                });
            } else {
                console.log(event.data);
            }
        };
    }, false);
}

function normalizedError(error) {
    if (error && error.status && error.status != 'success') {
        return error;
    } else if (error.code || error.reason){ // WebSocket CloseEvent
        return _.extend({
            status: 'error',
            code: error.code,
            message: error.reason || 'WebSocket error',
            wasClean: error.wasClean
        }, toJSONObject(error));
    } else if (error.target && error.target.errorCode){
        return _.extend({
            status: 'error',
            errorCode: error.target.errorCode
        }, toJSONObject(error));
    } else if (error.message && error.stack) {
        return _.extend({
            status: 'error',
            message: error.message,
            stack: error.stack
        }, toJSONObject(error));
    } else if (error.message) {
        return _.extend({
            status: 'error'
        }, toJSONObject(error));
    } else {
        return {
            status: 'error',
            message: toJSONObject(error)
        };
    }
}

function toJSONObject(value, omitObjects) {
    var omit = omitObjects || [];
    var type = typeof value;
    var obj = value && type === 'object';
    if (obj && omit.indexOf(value) >= 0) {
        return undefined;
    } else if (obj) {
        omit.push(value);
    }
    if (type === 'string' || type === 'number' || type === 'null' || !value && type === 'object') {
        return value;
    } else if (obj && typeof value.toJSON === 'function') {
        return value;
    } else if (Object.prototype.toString.apply(value) === '[object Array]') {
        var array = new Array(value.length);
        for (var i=0; i<value.length; i++) {
            array[i] = toJSONObject(value[i], omit);
        }
        return array;
    } else if (obj) {
        var object = {};
        for (var k in value) {
            if (k == 'prototype') continue;
            var json = toJSONObject(value[k], omit);
            if (json !== undefined) {
                object[k] = json;
            }
        }
        return object;
    } else {
        return undefined;
    }
}