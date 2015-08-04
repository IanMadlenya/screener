// indicator.js
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

jQuery(function($){

    $('#interval').change(validateExpression);
    $('#expression').change(validateExpression).change();

    screener.listExchanges().then(function(result){
        var security = window.location.hash.substring(2);
        var exchange = result.filter(function(exchange){
            return security.indexOf(exchange.iri + '/') === 0;
        })[0];
        $('#backtesting-exchange').empty().append(_.map(result, function(exchange){
            return $('<option></option>', {
                value: exchange.iri
            }).text(exchange.label);
        })).change(function(event){
            if (event.target.value) {
                screener.setItem('indicator-backtest-exchange', event.target.value);
            }
        });
        if (exchange) {
            $('#backtesting-exchange').val(exchange.iri);
            $('#backtesting-ticker').val(security.substring(exchange.iri.length + 1));
        } else {
            $('#backtesting-exchange').val(screener.getItem('indicator-backtest-exchange'));
            $('#backtesting-ticker').val(screener.getItem('indicator-backtest-ticker'));
        }
        if (window == window.parent) {
            backtest();
            $(window).resize(backtest);
        }
    }).catch(calli.error);

    $('#backtesting-ticker').change(function(event){
        if (event.target.value) {
            screener.setItem('indicator-backtest-ticker', event.target.value);
        }
    });
    $('#backtesting-asof').change(function(event){
        if (event.target.value) {
            screener.setBacktestAsOfDateString(event.target.value);
        }
    }).val(screener.getBacktestAsOfDateString());

    $('#backtesting-form').submit(function(event){
        event.preventDefault();
        $('#backtesting-form').find('button[type="submit"]').addClass('active');
        backtest().catch(calli.error).then(function(){
            $('#backtesting-form').find('button[type="submit"]').removeClass('active');
        });
    });

    function validateExpression(){
        var group = $('#expression').closest('.form-group');
        group.find('.form-control-feedback').remove();
        group.removeClass('has-warning has-error has-success has-feedback');
        var expression = $('#expression').val();
        var hasInterval = $('[rel="screener:hasInterval"] [about]').attr('about');
        if (expression && hasInterval) {
            var interval = hasInterval.substring(hasInterval.lastIndexOf('/') + 1);
            screener.validate(expression, interval).then(function(){
                group.addClass('has-success has-feedback');
                $('<span></span>', {
                    "class":"glyphicon glyphicon-ok form-control-feedback"
                }).appendTo(group);
            }, function(){
                group.addClass('has-error has-feedback');
                $('<span></span>', {
                    "class": "glyphicon glyphicon-remove form-control-feedback"
                }).appendTo(group);
            });
        }
    }

    function backtest() {
        var security = getSecurity();
        var asof = screener.getBacktestAsOf();
        var interval = getInterval();
        var key = {asof: asof, security: security, interval: interval};
        $('#relative-div').data(key);
        return new Promise(function(callback){
            google.load('visualization', '1.0', {
                packages: ['corechart'],
                callback: callback
            });
        }).then(function(){
            var expr = getExpression();
            var unit = getUnit();
            var promises = [];
            if (asof && security && interval) {
                var derivedFromRelative = getDerivedFrom('discrete').concat(getDerivedFrom('relative'));
                var derivedFromPrice = getDerivedFrom('price');
                var derivedFromVolume = getDerivedFrom('volume');
                var derivedFromPercent = getDerivedFrom('percent');
                if (unit == 'relative' || unit == 'discrete') {
                    promises.push(chartRelative(asof, security, interval, [expr], 0));
                }
                if (derivedFromRelative.length) {
                    derivedFromRelative.forEach(function(derivedFrom, index){
                        promises.push(chartRelative(asof, security, interval, [derivedFrom], index+1));
                    });
                }
                if (unit == 'price') {
                    promises.push(chartPrice(asof, security, interval, _.compact(_.union([expr], derivedFromPrice))));
                } else if (derivedFromPrice.length) {
                    promises.push(chartPrice(asof, security, interval, derivedFromPrice));
                }
                if (unit == 'volume') {
                    promises.push(chartVolume(asof, security, interval, _.compact(_.union([expr], derivedFromVolume))));
                } else if (derivedFromVolume.length) {
                    promises.push(chartVolume(asof, security, interval, derivedFromVolume));
                }
                if (unit == 'percent') {
                    promises.push(chartPercent(asof, security, interval, _.compact(_.union([expr], derivedFromPercent))));
                } else if (derivedFromPercent.length) {
                    promises.push(chartPercent(asof, security, interval, derivedFromPercent));
                }
            }
            return Promise.all(promises);
        }).then(function(charts){
            if (!_.isEqual(key, $('#relative-div').data())) return undefined;
            $('#relative-div').empty();
            $('#price-div').empty();
            $('#volume-div').empty();
            charts.forEach(function(chart){
                if (!chart.containerId) {
                    var div = $('<div></div>');
                    $('#relative-div').append(div);
                    var counter = div.prevAll().length;
                    chart.containerId = 'relative-div-' + counter;
                    div.attr('id', chart.containerId);
                }
                google.visualization.drawChart(chart);
            });
        }).catch(calli.error);
    }

    function getSecurity() {
        var ticker = $('#backtesting-ticker').val();
        if (!ticker) return ticker;
        return $('#backtesting-exchange').val() + '/' + encodeURI(ticker);
    }

    function getInterval() {
        var hasInterval = direct('[rel="screener:hasInterval"]');
        var uri = hasInterval.attr('resource') || hasInterval.children('[about]').attr('about');
        return uri && uri.substring(uri.lastIndexOf('/') + 1);
    }

    function getExpression() {
        var property = direct('[property="screener:expression"]');
        return property.attr('content') || property.text();
    }

    function getUnit() {
        var uri = direct('[rel="screener:hasUnit"]').attr('resource');
        return uri && uri.substring(uri.lastIndexOf('/') + 1);
    }

    function getDerivedFrom(unit) {
        return _.map($('[rel="screener:isDerivedFrom"] [resource]:has([rel="screener:hasUnit"][resource$="' + unit + '"])').toArray(), function(elem){
            return $(elem).find('[property="screener:expression"]').attr('content');
        });
    }

    function direct(selector) {
        var body = $('body').attr('resource');
        return $(selector).filter(function(elem) {
            return body == $(this).parent().closest('[resource]').attr('resource');
        });
    }

    function chartPercent(asof, security, interval, expressions) {
        return chartRelative(asof, security, interval, expressions).then(function(chart){
            return _.extend(chart, {
                "containerId": "percent-div"
            });
        });
    }

    function chartRelative(asof, security, interval, expressions, counter) {
        var candlestick = ['asof'];
        var columns = expressions ? candlestick.concat(expressions) : candlestick;
        return screener.load(security, columns, interval, 65, asof).then(function(data) {
            return data.map(function(result) {
                var asof = new Date(result.asof);
                var d = new Date(asof.getFullYear(), asof.getMonth(), asof.getDate());
                var first = [d];
                if (!expressions) return first;
                return first.concat(expressions.map(function(expression){
                    return result[expression];
                }));
            });
        }).then(function(rows){
            var colours = ["#3366cc","#dc3912","#ff9900","#109618","#990099","#0099c6","#dd4477","#66aa00","#b82e2e","#316395","#994499","#22aa99","#aaaa11","#6633cc","#e67300","#8b0707","#651067","#329262","#5574a6","#3b3eac","#b77322","#16d620","#b91383","#f4359e","#9c5935","#a9c413","#2a778d","#668d1c","#bea413","#0c5922","#743411"];
            var table = new google.visualization.DataTable();
            table.addColumn('date', 'Day');
            if (expressions) {
                expressions.forEach(function(expression){
                    table.addColumn('number', expression);
                });
            }
            table.addRows(rows);
            return {
                "dataTable": table,
                "chartType": "ComboChart",
                "options": {
                    seriesType: rows.length > 20 ? "line" : "bars",
                    chartArea: {width: '70%', height: '90%'},
                    colors: counter ? colours.slice(counter % colours.length, colours.length) : colours,
                    height: 200,
                    width: window.innerWidth
                }
            };
        });
    }

    function chartPrice(asof, security, interval, expressions) {
        var candlestick = ['asof', 'low', 'open', 'close', 'high'];
        var columns = expressions ? candlestick.concat(expressions) : candlestick;
        return screener.load(security, columns, interval, 65, asof).then(function(data) {
            return data.map(function(result) {
                var asof = new Date(result.asof);
                var d = new Date(asof.getFullYear(), asof.getMonth(), asof.getDate());
                var first = [d, result.low, result.open, result.close, result.high];
                if (!expressions) return first;
                return first.concat(expressions.map(function(expression){
                    return result[expression];
                }));
            });
        }).then(function(rows){
            var table = new google.visualization.DataTable();
            table.addColumn('date', 'Day');
            table.addColumn('number', 'Price');
            table.addColumn('number');
            table.addColumn('number');
            table.addColumn('number');
            if (expressions) {
                expressions.forEach(function(expression){
                    table.addColumn('number', expression);
                });
            }
            table.addRows(rows);
            return {
                "containerId": "price-div",
                "dataTable": table,
                "chartType": "ComboChart",
                "options": {
                    seriesType: "line",
                    series: {0: {type: "candlesticks"}},
                    chartArea: {width: '70%', height: '90%'},
                    candlestick: {
                        hollowIsRising: true,
                        fallingColor: {
                            strokeWidth: 1
                        },
                        risingColor: {
                            strokeWidth: 1
                        }
                    },
                    height: 400,
                    width: window.innerWidth
                }
            };
        });
    }

    function chartVolume(asof, security, interval, expressions) {
        var candlestick = ['asof', 'volume'];
        var columns = expressions ? candlestick.concat(expressions) : candlestick;
        return screener.load(security, columns, interval, 65, asof).then(function(data) {
            return data.map(function(result) {
                var asof = new Date(result.asof);
                var d = new Date(asof.getFullYear(), asof.getMonth(), asof.getDate());
                var first = [d, result.volume];
                if (!expressions) return first;
                return first.concat(expressions.map(function(expression){
                    return result[expression];
                }));
            });
        }).then(function(rows){
            var table = new google.visualization.DataTable();
            table.addColumn('date', 'Day');
            table.addColumn('number', 'Volume');
            if (expressions) {
                expressions.forEach(function(expression){
                    table.addColumn('number', expression);
                });
            }
            table.addRows(rows);
            return {
                "containerId": "volume-div",
                "dataTable": table,
                "chartType": "ComboChart",
                "options": {
                    seriesType: "line",
                    series: {0: {type: "bars"}},
                    chartArea: {width: '70%', height: '90%'},
                    height: 200,
                    width: window.innerWidth
                }
            };
        });
    }
});
