// dtn-quote.js
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

importScripts('../assets/moment/moment-with-langs.js');
var window = { moment: moment };
importScripts('../assets/moment/moment-timezone.js');
importScripts('../assets/moment/moment-timezone-data.js');

importScripts('utils.js');

self.addEventListener("connect", _.partial(function(hit, event) {
    event.ports[0].onmessage = _.partial(dispatch, {

        close: function(event) {
            hit('close');
        },

        ping: function() {
            return 'pong';
        },

        validate: function(event) {
            if ('m1' != event.data.period && 'm15' != event.data.period)
                return Promise.reject({status: 'error'});
            return event.data.fields.reduce(function(memo, field){
                if (['open','high','low','close','volume','total_volume'].indexOf(field) >= 0)
                    return memo;
                throw new Error("Unknown field: " + field);
            }, {status: 'success'});
        },

        reset: function(event) {
            return {status: 'success'};
        },

        quote: function(event) {
            var data = event.data;
            var period = data.period;
            if (period != 'm1' && period != 'm10' && period != 'm60') return {status: 'success', result: []};
            var interval = period == 'm1' ? 60 : period == 'm10' ? 600 : 3600;
            var symbol = (data.exchange.dtnPrefix || '') + data.ticker;
            var asof = Date.now();
            return hit({
                symbol: symbol,
                interval: interval,
                begin: moment(data.start).tz('America/New_York').format('YYYYMMDD HHmmss'),
                end: moment(data.end).tz('America/New_York').format('YYYYMMDD HHmmss')
            }).then(function(lines){
                var results = lines.map(function(line){
                    var row = line.split(',');
                    return {
                        symbol: symbol,
                        dateTime: moment.tz(row[1], 'America/New_York').tz(data.exchange.tz).format(),
                        high: parseFloat(row[2]),
                        low: parseFloat(row[3]),
                        open: parseFloat(row[4]),
                        close: parseFloat(row[5]),
                        total_volume: parseFloat(row[6]),
                        volume: parseFloat(row[7])
                    };
                });
                if (results.length && moment(results[0].dateTime).valueOf() > asof - (interval * 1000)) {
                    results = results.slice(1); // first line might yet be incomplete
                }
                return {
                    status: 'success',
                    exchange: data.exchange,
                    ticker: data.ticker,
                    symbol: symbol,
                    period: period,
                    start: data.start,
                    end: data.end,
                    result: results
                };
            });
        }
    });
}, openHIT()), false);

function openHIT(){
    var pending = {};
    var seq = 0;
    var buffer = '';
    var onmessage = function(event) {
        buffer = buffer ? buffer + event.data : event.data;
        while (buffer.indexOf('\n') >= 0) {
            var idx = buffer.indexOf('\n') + 1;
            var line = buffer.substring(0, idx).replace(/\s*$/,'');
            buffer = buffer.substring(idx);
            var id = line.substring(0, line.indexOf(','));
            if (line.indexOf(id + ',!ENDMSG!,') === 0) {
                if (pending[id])
                    pending[id].callback(pending[id].buffer);
                delete pending[id];
            } else if (line.indexOf(id + ',E,') === 0) {
                if (pending[id]) {
                    var error = line.replace(/\w+,E,!?/,'').replace(/!?,*$/,'');
                    if ("NO_DATA" != error) {
                        pending[id].error(Error(error + " for " + pending[id].cmd));
                        delete pending[id];
                    }
                }
            } else if (pending[id]) {
                pending[id].buffer.push(line);
            } else if (line) {
                console.error(line);
            }
        }
    };
    var socket, queue;
    var construct = function(open,close){
        var opened = false;
        socket = new WebSocket('ws://probabilitytrading.net:1337/historical', 'IQFeed5.1');
        socket.onmessage = onmessage;
        socket.onopen = function(event) {
            opened = true;
            open(socket);
        };
        socket.onclose = function(event) {
            if (opened) {
                queue = undefined;
            } else {
                close(event);
            }
        };
    };
    var exec = function(fn){
        if (!queue || socket && socket.readyState > 1)
            queue = new Promise(construct);
        queue = queue.catch(function(error){
            // errors are handled by caller
        }).then(function(){
            return new Promise(fn);
        });
        var same = queue;
        queue.then(function(){
            setTimeout(function(){
                if (queue === same)
                    socket.close(3001, "WebSocket timeout");
            }, 10000);
        });
        return queue;
    };
    return function(options) {
        if (options == 'close') {
            if (socket) socket.close(3002, "WebWorker closed");
            return;
        }
        if (!options || !options.symbol)
            throw Error("Missing symbol in " + JSON.stringify(options));
        return exec(function(callback, error){
            var id = ++seq;
            var cmd = ["HIT"];
            cmd.push(options.symbol);
            cmd.push(options.interval);
            cmd.push(options.begin);
            cmd.push(options.end);
            cmd.push(options.maxDatapoints || '');
            cmd.push(options.beginFilterTime || '');
            cmd.push(options.endFilterTime || '');
            cmd.push(options.dataDirection || '0');
            cmd.push(id);
            cmd.push(options.datapointsPerSend || '');
            cmd.push(options.intervalType || 's');
            var msg = cmd.join(',');
            pending[id] = {
                cmd: msg,
                buffer:[],
                callback: callback,
                error: error
            };
            socket.send(msg + '\r\n');
        });
    };
}
