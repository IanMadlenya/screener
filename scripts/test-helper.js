// test-helper.js
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

jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;

function roundTripBacktestAsOf(date) {
    return function(){
        screener.setBacktestAsOf(date);
        expect(screener.getBacktestAsOf()).toEqual(date);
    };
}

function rejectBacktestAsOf(date) {
    return function(){
        expect(function(){
            screener.setBacktestAsOf(date);
        }).toThrow();
    };
}

function ignoreBacktestAsOf(date) {
    return function(){
        localStorage.removeItem('backtest-as-of');
        sessionStorage.setItem('backtest-as-of', date);
        expect(screener.getBacktestAsOf()).not.toEqual(date);
    };
}

function isValid(/* intervals */) {
    var intervals =  Array.prototype.slice.call(arguments, 0);
    return function(expression){
        return function(done){
            Promise.all(intervals.map(function(interval){
                return screener.validate(expression, interval);
            })).then(done, unexpected(done));
        };
    };
}

function isInvalid(/* intervals */) {
    var intervals =  Array.prototype.slice.call(arguments, 0);
    return function(expression) {
        return function(done){
            Promise.all(intervals.map(function(interval){
                return screener.validate(expression).then(unexpected(done)).catch(function(data){
                    expect(data.status).toBe('error');
                    expect(data.message).toBeTruthy();
                    expect(data.expression).toEqual(expression);
                });
            })).then(done, unexpected(done));
        };
    };
}

function listExchangeShouldInclude(mic) {
    return function(done){
        screener.listExchanges().then(function(exchanges){
            return _.difference([], _.pluck(exchanges, 'mic'));
        }).then(function(missing){
            expect(missing).toEqual([]);
        }).then(done, unexpected(done));
    };
}

function checkSectorListing(mics, expectedSectors) {
    return function(done) {
        screener.listExchanges().then(_.values).then(function(result){
            expect(result.length).not.toBe(0);
            return result.filter(function(exchange){
                return mics.indexOf(exchange.mic) >= 0;
            });
        }).then(_.partial(_.pluck, _, 'iri')).then(function(exchanges) {
            return Promise.all(exchanges.map(function(exchange){
                return screener.listSectors(exchange).then(function(result){
                    expect(result).toEqual(expectedSectors);
                });
            }));
        }).then(done, unexpected(done));
    };
}

function checkCompanyListing(mic, sector, ticker) {
    return function(done) {
        screener.listExchanges().then(_.values).then(function(result){
            expect(result.length).not.toBe(0);
            return result.filter(function(exchange){
                return mic == exchange.mic;
            });
        }).then(_.partial(_.pluck, _, 'iri')).then(_.first).then(function(exchange) {
            return screener.listSecurities(exchange, sector).then(function(result){
                expect(result).toContain(exchange + '/' + ticker);
            });
        }).then(done, unexpected(done));
    };
}

function checkCompanyMarketCap(mic, sector, mincap, maxcap, ticker) {
    return function(done) {
        screener.listExchanges().then(_.values).then(function(result){
            expect(result.length).not.toBe(0);
            return result.filter(function(exchange){
                return mic == exchange.mic;
            });
        }).then(_.partial(_.pluck, _, 'iri')).then(_.first).then(function(exchange) {
            return screener.listSecurities(exchange, sector, mincap, maxcap).then(function(result){
                expect(result).toContain(exchange + '/' + ticker);
                return exchange;
            });
        }).then(function(exchange) {
            if (!mincap) return exchange;
            return screener.listSecurities(exchange, sector, 0, mincap).then(function(result){
                expect(result).not.toContain(exchange + '/' + ticker);
                return exchange;
            });
        }).then(function(exchange) {
            if (!maxcap) return exchange;
            return screener.listSecurities(exchange, sector, maxcap).then(function(result){
                expect(result).not.toContain(exchange + '/' + ticker);
                return exchange;
            });
        }).then(done, unexpected(done));
    };
}

function loadQuotesWithError(errorMessage) {
    return function(mic, ticker, expressions, length, interval, asof) {
        return function(done) {
            screener.listExchanges().then(_.values).then(function(result){
                expect(result.length).not.toBe(0);
                return result.filter(function(exchange){
                    return mic == exchange.mic;
                });
            }).then(function(exchanges){
                return exchanges[0].iri + '/' + encodeURI(ticker);
            }).then(function(security){
                return screener.load(security, expressions, length, interval, asof);
            }).then(unexpected(done)).catch(function(data){
                expect(data.status).not.toBe('success');
                expect(data.message).toBe(errorMessage);
            }).then(done, unexpected(done));
        };
    };
}

function loadQuotes(mic, ticker, expressions, length, interval, asof, rows) {
    return function(done) {
        screener.listExchanges().then(_.values).then(function(result){
            expect(result.length).not.toBe(0);
            return result.filter(function(exchange){
                return mic == exchange.mic;
            });
        }).then(function(exchanges){
                return exchanges[0].iri + '/' + encodeURI(ticker);
        }).then(function(security){
            return screener.load(security, expressions, length, interval, asof);
        }).then(function(result){
            expect(result.length).toBe(length);
            expect(result).toEqual(rows);
        }).then(done, unexpected(done));
    };
}

function screenCheck(watchLists, screens, asof, points) {
    return function(done) {screener.listExchanges().then(_.values).then(function(result){
            expect(result.length).not.toBe(0);
            return result;
        }).then(function(exchanges){
            return _.indexBy(_.values(exchanges), 'mic');
        }).then(function(exchanges){
            var lists = watchLists.map(function(watchList){
                return _.extend({}, watchList, {
                    exchange: exchanges[watchList.ofExchange],
                    includes: watchList.includes.map(function(symbol){
                        var mic = symbol.substring(0, symbol.indexOf(':'));
                        var prefix = exchanges[mic].iri;
                        return prefix + '/' + encodeURI(symbol.substring(symbol.indexOf(':') + 1));
                    })
                });
            });
            return screener.screen(lists, screens, asof).then(function(result){
                var expected = points.map(function(point){
                    var symbol = point.symbol;
                    var mic = symbol.substring(0, symbol.indexOf(':'));
                    var prefix = exchanges[mic].iri;
                    var security = prefix + '/' + encodeURI(symbol.substring(symbol.indexOf(':') + 1));
                    return _.extend({}, _.omit(point, 'symbol'), {
                        security: security
                    });
                });
                expect(result).toEqual(expected);
            });
        }).then(done, unexpected(done));
    };
}

function these(message, list, func) {
    _.each(list, function(value) {
        var call = _.isArray(value) ? 'apply' : 'call';
        it(message + ' ' + JSON.stringify(value), func[call](this, value));
    });
}

function xthese(message, list, func) {
    _.each(list, function(value) {
        var call = _.isArray(value) ? 'apply' : 'call';
        xit(message + ' ' + JSON.stringify(value), func[call](this, value));
    });
}

function unexpected(done){
    return function(data) {
        if (data.stack) {
            expect(data.stack).toBe(undefined);
        }
        expect(data).toBe(undefined);
        expect("should not have been called").toBe(undefined);
        done();
    };
}
