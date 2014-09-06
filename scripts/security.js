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
        var interval = 'm60';
        var asof = _.property(0);
        var low = _.property(1);
        var high = _.property(4);
        var margin = {top:1,left:60,right:60,bottom:50};
        var height = 600 - margin.top - margin.bottom;
        var svg = d3.select('#ohlc-div').append("svg").attr("height", height + margin.top + margin.bottom);
        var x =  d3.scale.linear();
        var y = d3.scale.linear().range([height, 0]).nice(20);
        var chart = updateAll(svg, "g")
            .attr("transform", 'translate(' + margin.left + ',' + margin.top + ')');
        var zoom = d3.behavior.zoom();
        var pane = svg.append("rect").attr("class", "pane").attr("height", height + margin.top).call(zoom);
        var rows, redrawCounter = 0;
        $(window).resize(function(){
            resizeChartWidth(margin.left + margin.right, svg, pane, zoom, x);
            if (rows) drawOhlcChart(chart, height, x, y, rows);
        });
        resizeChartWidth(margin.left + margin.right, svg, pane, zoom, x);
        var drawing = loadChartData(security, x, interval).then(redraw);
        return drawing;
        function redraw(new_rows){
            if (rows) {
                x.domain(mapDateDomain(x.domain(), rows.map(asof), new_rows.map(asof)));
                rows = new_rows;
            } else {
                rows = new_rows;
                x.domain([0,rows.length-1]);
            }
            resizeChartWidth(margin.left + margin.right, svg, pane, zoom, x);
            zoom.on("zoomstart", function(){
                var pane = d3.select(this);
                pane.attr("class", pane.attr("class") + ' grabbing');
            });
            zoom.on("zoom", function(){
                drawOhlcChart(chart, height, x, y, rows);
            });
            zoom.on("zoomend", function(){
                var pane = d3.select(this);
                pane.attr("class", pane.attr("class").replace(/ grabbing/g,''));
                drawOhlcChart(chart, height, x, y, rows);
                var int = getOptimalInterval(x, interval, rows);
                if (interval != int || x.range()[1] > rows.length * 5.05) {
                    var counter = ++redrawCounter;
                    drawing = drawing.then(function(){
                        return new Promise(function(callback){
                            setTimeout(callback, 1000);
                        });
                    }).then(function(){
                        if (counter == redrawCounter) {
                            return loadChartData(security, x, int).then(redraw).then(function(){
                                interval = int;
                            });
                        }
                    }).catch(calli.error);
                }
            });
            drawOhlcChart(chart, height, x, y, rows);
        }
    }

    function getOptimalInterval(x, interval, rows) {
        var m = parseInt(interval.substring(1), 10);
        var d = x.domain();
        var min = Math.max(Math.floor(d[0]),0);
        var max = Math.min(Math.ceil(d[1]),rows.length-1);
        var len = Math.floor((x(rows.length-1) - x(min)) / 5);
        var minutes = Math.min(Math.max(Math.round((max - min) * m / (x(max) - x(min))) * 5, 1), 60);
        console.log(minutes);
        return 'm' + minutes;
    }

    function loadChartData(security, x, interval) {
        console.log(interval, Math.floor(x.range()[1]/5));
        return screener.load(security, columns(interval), Math.floor(x.range()[1]/5), interval, new Date());
    }

    function mapDateDomain(d, _dates, dates) {
        var d0 = Math.max(Math.floor(d[0]),0);
        var d1 = Math.min(Math.ceil(d[1]), _dates.length-1);
        var p0 = _.sortedIndex(dates, _dates[d0], valueOf);
        var p1 = _.sortedIndex(dates, _dates[d1], valueOf);
        if (p0 == p1 || d0 == d1) return [0, dates.length-1];
        var s = (p1 - p0) / (d1 - d0);
        return [
            Math.max(0, p0 - (d0 - d[0]) * s),
            p1 - (d1 - d[1]) * s
        ];
    }

    function valueOf(date) {
        return date.valueOf();
    }

    function resizeChartWidth(margin, svg, pane, zoom, x) {
        var width = document.documentElement.clientWidth;
        svg.attr("width", width);
        pane.attr("width", width);
        x.range([0, width - margin]);
        zoom.x(x);
    }

    function columns(interval) {
        var m = parseInt(interval.substring(1), 10);
        return ['asof', 'low', 'open', 'close', 'high', 'volume',
            fn('POC', 4), fn('LOW_VALUE', 4), fn('HIGH_VALUE', 4),
            fn('POC', 8), fn('LOW_VALUE', 8), fn('HIGH_VALUE', 8),
            fn('POC',65), fn('LOW_VALUE',65), fn('HIGH_VALUE',65)
        ];
        function fn(name, hours) {
            return name + '(' + Math.round(hours * 60 / m) + ')';
        }
    }

    function drawOhlcChart(chart, height, x, y, rows) {
        var asof = _.property(0);
        var low = _.property(1);
        var open = _.property(2);
        var close = _.property(3);
        var high = _.property(4);
        var volume = _.property(5);
        var width = x.range()[1];
        var start = Math.max(0,Math.ceil(x.domain()[0]));
        var visible = rows.slice(start, Math.min(rows.length, Math.floor(x.domain()[1])));
        var xticks = timeTicks(_.map(visible, asof), 10).map(function(i){
            return start + i;
        });
        updateAll(chart, "line", "x", xticks).call(function(selection){
            selection.attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", height);
        });
        updateAll(chart, "text", "x", xticks).call(function(selection){
            selection.attr("x", x).attr("y", height).attr("dy", 20)
            .text(function(d, i){
                if (d < 0 || d >= rows.length) return '';
                var date = asof(rows[d]);
                var ref = asof(rows[i===0? xticks[i+1] : xticks[i-1]]);
                if (date.getFullYear() != ref.getFullYear()) return date.getFullYear();
                if (date.getMonth() != ref.getMonth()) return moment(date).format("MMM");
                if (date.getDate() != ref.getDate()) return date.getDate();
                if (date.getHours() != ref.getHours() && date.getMinutes() === 0) return moment(date).format("HH");
                if (date.getHours() != ref.getHours()) return moment(date).format("HH:mm");
                if (date.getMinutes() != ref.getMinutes()) return date.getMinutes();
                return moment(date).fromNow(true);
            });
        }).each(function(d){
            updateAll(d3.select(this), "title", "tip", [d]).text(asof(rows[d]).toLocaleString());
        });
        y.domain([low(_.min(rows.slice(start), low)), high(_.max(rows.slice(start), high))]);
        updateAll(chart, "line", "y", y.ticks(15).slice(1)).call(function(selection){
            selection.attr("x1", 0).attr("x2", width).attr("y1", y).attr("y2", y);
        });
        updateAll(chart, "text", "y", y.ticks(10).slice(1,-1).map(function(tick){
            return Math.round(tick * 100000) / 100000; // remove rounding errors
        })).call(function(selection){
            selection.attr("x", width+2).attr("y", y).text(String);
        });
        var ycross = (y(y.ticks(15)[0]) + y(y.ticks(15)[1])) / 2;
        var v = d3.scale.linear().domain([volume(_.min(rows, volume)), volume(_.max(rows, volume))*2]).range([height, 0]).nice(20);
        updateAll(chart, "text", "v", v.ticks(10).filter(function(d,i,ticks){
            return d > 0 && i<ticks.length/2;
        })).call(function(selection){
            selection.attr("x", -2).attr("y", v).text(screener.formatNumber);
        });
        var volume_width = 5;
        updateAll(chart, "rect", "volume", rows).call(function(selection){
            selection.attr("class", function(d){
                if (open(d) > close(d)) return "volume down";
                return "volume up";
            }).attr("x", function(d, i){
                return x(i) - volume_width / 2;
            }).attr("y", _.compose(v, volume)).attr("width", volume_width).attr("height", function(d){
                return height - v(volume(d));
            });
        }).each(function(d){
            updateAll(d3.select(this), "title", "tip", [d]).text(screener.formatNumber(volume(d)));
        });
        for (var poc=rows[0].length-3;poc>=6;poc-=3) {
            var g = updateAll(chart, "g", "poc" + ((poc - 6)/3));
            updateAll(g, "path", "poc").datum(rows).attr("d", d3.svg.line().x(function(d,i){
                return x(i);
            }).y(_.compose(y,_.property(poc))));
            updateAll(g, "path", "value-area").datum(rows).attr("d", d3.svg.area().x(function(d,i){
                return x(i);
            }).y0(_.compose(y,_.property(poc+1))).y1(_.compose(y,_.property(poc+2))));
        }
        var bars = updateAll(chart, "g", "bar", rows).each(function(d,i){
            var bar = d3.select(this);
            updateAll(bar, "path", "high-low").attr("d", 'M' + x(i) + ',' + y(high(d)) + ' L' + x(i) + ',' + y(low(d)));
            updateAll(bar, "path", "close").attr("d", 'M' + x(i) + ',' + y(close(d)) + ' L' + (x(i) + 2) + ',' + y(close(d)));
            updateAll(bar, "path", "open").attr("d", 'M' + (x(i) - 2) + ',' + y(open(d)) + ' L' + x(i) +',' + y(open(d)));
            updateAll(bar, "title", "tip").text(asof(d).toLocaleString());
        });
    }

    function timeTicks(times, size) {
        var min = times[0];
        var max = times[times.length-1];
        var years = [], months = [], weeks = [], days = [], noons = [], hours = [], thirty = [], teens = [], fives = [];
        times.forEach(function(time, i, times){
            var ref = i===0? time : times[i-1];
            if (time.getFullYear() != ref.getFullYear()) {
                years.push(i);
            } else if (time.getMonth() != ref.getMonth()) {
                months.push(i);
            } else if (time.getDay() < ref.getDay()) {
                weeks.push(i);
            } else if (time.getDate() != ref.getDate()) {
                days.push(i);
            } else if (time.getHours() % 12 < ref.getHours() % 12 && time.getMinutes() === 0) {
                noons.push(i);
            } else if (time.getHours() != ref.getHours()) {
                hours.push(i);
            } else if (time.getMinutes() % 30 < ref.getMinutes() % 30) {
                thirty.push(i);
            } else if (time.getMinutes() % 15 < ref.getMinutes() % 15) {
                teens.push(i);
            } else if (time.getMinutes() % 5 < ref.getMinutes() % 5) {
                fives.push(i);
            }
        });
        var ticks = [];
        var data = [years, months, weeks, days, noons, hours, thirty, teens, fives];
        for (var i=0;i<data.length;i++) {
            if (ticks.length >= size) break;
            if (size - ticks.length < Math.abs(size - ticks.length - data[i].length)) break;
            ticks = ticks.concat(data[i]);
        }
        return _.sortBy(ticks);
    }

    function updateAll(chart, tag, cls, data){
        var selector = cls ? (tag + '.' + cls) : tag;
        var existing = chart.selectAll(selector).data(data || [undefined]);
        var created = existing.enter().append(tag);
        if (cls) created.attr("class", cls);
        existing.exit().remove();
        return chart.selectAll(selector);
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