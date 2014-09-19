// security.js
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
    return Promise.resolve(new Date()).then(function(now){
        return Promise.resolve().then(function(){
            return window.location.href.substring(0, window.location.href.indexOf('?'));
        }).then(function(security){
            return setTitleToSecurity(security).then(function(){
                return drawOhlcChartData(security, now);
            }).then(function(){
                return drawDailySecurityData(security, now);
            }).then(function(){
                return window.location.hash.indexOf('#!') === 0 && window.location.hash.substring(2);
            }).then(function(screen){
                return drawScreenData(security, screen, now);
            });
        });
    }).catch(calli.error);

    function setTitleToSecurity(security) {
        return screener.listExchanges().then(function(result){
            return result.filter(function(exchange){
                return window.location.href.indexOf(exchange.iri) === 0;
            })[0];
        }).then(function(exchange){
            var ticker = security.substring(exchange.iri.length + 1);
            var symbol = exchange.mic + ':' + ticker;
            $('title').text(symbol);
            $('#page-title').text(symbol);
            return security;
        });
    }

    function drawOhlcChartData(security, now) {
        var interval = screener.getItem("interval", 'm60');
        var asof = _.property(0);
        var low = _.property(1);
        var open = _.property(2);
        var close = _.property(3);
        var high = _.property(4);
        var volume = _.property(5);
        var chart = d3.chart().width(document.documentElement.clientWidth).height(600).xPlot(asof);
        var since = moment().subtract(+screener.getItem("time-width", 365*24*60*60*1000), 'ms');
        chart.x(chart.x().domain([since, new Date()]));
        var v = d3.scale.linear().range(chart.y().range());
        chart.series("volume", d3.chart.series.bar(volume).y(v));
        chart.series("price", d3.chart.series.ohlc(open, high, low, close));
        var redrawCounter = 0;
        $(window).resize(function(){
            chart.width(document.documentElement.clientWidth);
            d3.select('#ohlc-div').call(chart);
        });
        var drawing = screener.load(security, ['asof',
                'POC(8)','HIGH_VALUE(8)','LOW_VALUE(8)',
                'POC(16)','HIGH_VALUE(16)','LOW_VALUE(16)',
                'POC(128)','HIGH_VALUE(128)','LOW_VALUE(128)'], 1024, 'm30', new Date()).then(function(rows){
            chart.series("poc poc0", d3.chart.series.line(_.property(1)).xPlot(_.property(0)).datum(rows));
            chart.series("band band0", d3.chart.series.band(_.property(2), _.property(3)).xPlot(_.property(0)).datum(rows));
            chart.series("poc poc1", d3.chart.series.line(_.property(4)).xPlot(_.property(0)).datum(rows));
            chart.series("band band1", d3.chart.series.band(_.property(5), _.property(6)).xPlot(_.property(0)).datum(rows));
            chart.series("poc poc2", d3.chart.series.line(_.property(7)).xPlot(_.property(0)).datum(rows));
            chart.series("band band2", d3.chart.series.band(_.property(8), _.property(9)).xPlot(_.property(0)).datum(rows));
        }).then(function(){
            return screener.load(security, ['close'], 1, 'd1', new Date()).then(function(data){
                var close = data[0][0];
                chart.rule(close);
            });
        }).then(function(){
            return loadChartData(security, interval, optimalDataLength(chart) * 4).then(redraw);
        });
        return drawing;
        function redraw(rows){
            v.domain([_.min(rows.map(volume)), _.max(rows.map(volume))]);
            chart.datum(rows);
            var visible = chart.visible();
            if (visible.length > 1) {
                screener.setItem("time-width", asof(visible[visible.length-1],visible.length-1).valueOf() - asof(visible[0],0).valueOf());
            }
            var m = parseInt(interval.substring(1), 10);
            var ppp = Math.max(chart.innerWidth()/(visible.length || rows.length), 5);
            chart.scaleExtent([Math.min(m/60 /ppp*5,1), Math.max(m/1 /ppp*5,1)]);
            chart.zoomend(function(){
                var int = optimalInterval(chart, interval);
                var len = optimalDataLength(chart);
                if (interval != int || len > rows.length) {
                    var counter = ++redrawCounter;
                    drawing = drawing.then(function(){
                        if (counter == redrawCounter && int == optimalInterval(chart, interval)) {
                            console.log("loading", int);
                            return loadChartData(security, int, optimalDataLength(chart) * 4).then(function(rows){
                                if (int == optimalInterval(chart, interval)) {
                                    interval = int;
                                    screener.setItem("interval", interval);
                                    console.log("loaded", interval);
                                    redraw(rows);
                                }
                            }, function(error) {
                                calli.error(error);
                            });
                        }
                    });
                }
            });
            d3.select('#ohlc-div').call(chart);
        }
    }

    function optimalInterval(chart, interval) {
        var intervals = ['m1','m5','m15','m30','m60'];
        var minutesPerPixel = intervals.map(function(interval){
            var m = parseInt(interval.substring(1), 10);
            return m / 5; // minimum minutes per pixel
        });
        var x = _.compose(chart.x(), chart.xPlot());
        var datum = chart.visible() || [];
        if (!datum.length) return interval;
        var index = intervals.indexOf(interval);
        var minutes = datum.length * parseInt(interval.substring(1), 10);
        var width = x(datum[datum.length-1], datum.length-1) - x(datum[0], 0);
        var diff = _.sortedIndex(minutesPerPixel, Math.round(minutes / width)) - index;
        if (diff === 0) return interval;
        var i = index + (diff < 0 ? -1 : 1);
        return intervals[Math.min(Math.max(i, 0), intervals.length-1)];
    }

    function optimalDataLength(chart) {
        var x = _.compose(chart.x(), chart.xPlot());
        var datum = chart.datum() || [];
        var visible = chart.visible() || [];
        var tail = visible.length ? x(datum[datum.length-1], datum.length-1) - x(visible[visible.length-1], visible.length-1) : 0;
        var width = chart.innerWidth() + tail;
        return Math.ceil(width / 5);
    }

    function loadChartData(security, interval, len) {
        return screener.load(security, ['asof', 'low', 'open', 'close', 'high', 'volume'], len, interval, new Date());
    }

    function drawDailySecurityData(security, now) {
        return loadGoogle().then(function(){
            var columns = ['date(asof)', 'low', 'open', 'close', 'high'];
            return screener.load(security, columns, 125, 'd1', now);
        }).then(function(rows){
            $(window).resize(drawPriceChart.bind(this, rows));
            drawPriceChart(rows);
        });
    }

    function drawScreenData(security, screen, now) {
        return loadGoogle().then(function(){
            return screener.listScreens().then(function(screens){
                return screens.filter(function(scr){
                    return scr.iri == screen;
                }).map(function(screen){
                    return screen.filters.map(function(filter){
                        return filter.forIndicator;
                    });
                });
            }).then(_.flatten);
        }).then(function(indicators){
            return screener.listIndicators().then(function(indicators){
                return _.indexBy(indicators, 'iri');
            }).then(function(indicatorsByIri){
                return indicators.map(function(indicator) {
                    return indicatorsByIri[indicator];
                });
            }).then(_.compact).then(_.uniq);
        }).then(function(indicators){
            return _.groupBy(indicators, function(indicator){
                var int = indicator.hasInterval;
                return int.substring(int.lastIndexOf('/') + 1);
            });
        }).then(function(indicators){
            return Promise.all(_.keys(indicators).sort(function(i1, i2){
                if (i1 == i2) return 0;
                if (i1 == 'annual') return -1;
                if (i2 == 'annual') return 1;
                if (i1 == 'quarter') return -1;
                if (i2 == 'quarter') return 1;
                if (i1.charAt(0) < i2.charAt(0)) return -1;
                if (i1.charAt(0) > i2.charAt(0)) return 1;
                var n1 = parseInt(i1.substring(1), 10);
                var n2 = parseInt(i2.substring(1), 10);
                return n2 - n1;
            }).map(function(interval){
                var id = interval + '-div';
                $('#candlestick-div').after($('<div></div>', {
                    id: id
                }));
                var expressions = indicators[interval].map(function(indicator){
                    return indicator.expression;
                });
                var columns = ['date(asof)'].concat(expressions);
                return screener.load(security, columns, 125, interval, now).then(function(rows){
                    return rows.map(function(row){
                        return _.object(columns, row);
                    });
                }).then(function(results){
                    $(window).resize(drawIndicatorCharts.bind(this, id, indicators[interval], results));
                    drawIndicatorCharts(id, indicators[interval], results);
                });
            }));
        });
    }

    function loadGoogle() {
        return new Promise(function(resolve, reject) {
            google.load('visualization', '1.0', {
                packages: ['corechart'],
                callback: resolve
            });
        });
    }

    function drawPriceChart(rows) {
        var table = new google.visualization.DataTable();
        table.addColumn('date', 'Day');
        table.addColumn('number', 'Price');
        table.addColumn('number');
        table.addColumn('number');
        table.addColumn('number');
        if (_.isArray(rows)) {
            table.addRows(rows);
        } else {
            console.log(rows);
        }
        google.visualization.drawChart({
            "containerId": "candlestick-div",
            "dataTable": table,
            "chartType": "ComboChart",
            "options": {
                seriesType: "line",
                series: {0: {type: "candlesticks"}},
                chartArea: {top: '0.5em', right: 0, width: '80%', height: '90%'},
                legend: {position: 'none'},
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
        });
    }

    function drawIndicatorCharts(containerId, indicators, results){
        var colours = ["#3366cc","#dc3912","#ff9900","#109618","#990099","#0099c6","#dd4477","#66aa00","#b82e2e","#316395","#994499","#22aa99","#aaaa11","#6633cc","#e67300","#8b0707","#651067","#329262","#5574a6","#3b3eac","#b77322","#16d620","#b91383","#f4359e","#9c5935","#a9c413","#2a778d","#668d1c","#bea413","#0c5922","#743411"];
        indicators.forEach(function(indicator, counter){
            var id = indicator.expression.replace(/\W+/g, '_') + '-' + containerId;
            if (!$('#' + id).length){
                $('#' + containerId).append($('<div></div>', {
                    id: id
                }));
            }
            var table = new google.visualization.DataTable();
            table.addColumn('date', 'Day');
            table.addColumn('number', indicator.label);
            table.addRows(results.map(function(result){
                return [result['date(asof)'], result[indicator.expression]];
            }));
            google.visualization.drawChart({
                "containerId": id,
                "dataTable": table,
                "chartType": "ComboChart",
                "options": {
                    seriesType: results.length > 20 ? "line" : "bars",
                    chartArea: {width: '80%', height: '90%'},
                    colors: colours.slice(counter % colours.length, colours.length),
                    height: 200,
                    width: window.innerWidth
                }
            });
        });
    }
});