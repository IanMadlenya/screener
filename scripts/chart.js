// chart.js
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

(function(d3) {
    d3.chart = function() {
        var datum = [];
        var xIteratee = function(d,i){
            return i;
        };
        var series = {};
        var width = 800;
        var height = 600;
        var margin = {
            top: 10,
            left: 10,
            right: 70,
            bottom: 20
        };
        var svg = d3.selectAll([]);
        var grid = d3.selectAll([]);
        var pane = d3.selectAll([]);
        var axis = d3.selectAll([]);
        var x_orig = d3.time.scale().domain([moment().subtract(1,'years').toDate(), new Date()]).range([0,width-margin.left-margin.right]);
        var x = x_orig.copy();
        var y = d3.scale.log().domain([10,100]).range([height-margin.bottom-margin.top,0]);
        var xAxis = d3.svg.axis().ticks(30);
        var yAxis = d3.svg.axis().orient("right").tickFormat(d3.format('.2f'));
        var yRule = 0;
        var clip = 'clip-' + Math.random().toString(16).slice(2);
        var listeners = {};
        var zoomFocal, zoomScale, zoomCounter = 0;
        var dragOffset, dragPoints;
        var drag = d3.behavior.drag().origin(function(){
            if (d3.event.type == "mousedown") {
                dragOffset = d3.event.y - chart.y()(yRule);
            }
            var domain = [chart.x().invert(0), chart.x().invert(chart.innerWidth())];
            dragPoints = _.reduce(series, function(array, series){
                series.points(domain, function(point){
                    var i = _.sortedIndex(array, point);
                    if (point != array[i])
                        array.splice(i, 0, point);
                });
                return array;
            }, []);
            return {x:0,y:chart.y()(yRule)};
        }).on("drag", function(){
            var domain = chart.y().domain();
            var se = d3.event.sourceEvent;
            var position = dragOffset && se && se.type == "mousemove" ? se.y - dragOffset : d3.event.y;
            var value = dragPoints[Math.min(_.sortedIndex(dragPoints, chart.y().invert(position)),dragPoints.length-1)] || 0;
            yRule = Math.max(domain[0], Math.min(domain[domain.length-1], value)) || 0;
            var rule = d3.select(this.parentElement);
            rule.attr("transform", f('translate', chart.innerWidth() + margin.left, chart.y()(yRule)+margin.top)).select("text").text(yRule);
        }).on("dragend", function(){
            redraw();
            dragOffset = dragPoints = undefined;
        });
        var zoom = d3.behavior.zoom().on("zoomstart", function(){
            zoomCounter++;
            if (d3.event.sourceEvent.type == 'mousedown') {
                pane.attr("class", pane.attr("class") + ' grabbing');
            }
            zoomFocal = chart.x().invert(d3.mouse(grid.node())[0]);
            zoomScale = zoom.scale();
            if (listeners.zoomstart)
                listeners.zoomstart.apply(this, arguments);
        }).on("zoom", function(){
            zoomCounter++;
            if (zoomScale == zoom.scale()) { // pan
                scaleChart(zoomFocal, d3.mouse(grid.node())[0]);
                zoomScale = zoom.scale();
            } else {
                scaleChart(); // zoom
            }
            if (listeners.zoom)
                listeners.zoom.apply(this, arguments);
            redraw();
        }).on("zoomend", function(){
            var count = ++zoomCounter;
            pane.attr("class", pane.attr("class").replace(/ grabbing/g,''));
            if (zoomScale == zoom.scale()) { // pan
                scaleChart(zoomFocal, d3.mouse(grid.node())[0]);
                zoomScale = zoom.scale();
            } else {
                scaleChart(); // zoom
            }
            if (listeners.zoomend)
                listeners.zoomend.apply(this, arguments);
            _.delay(function(){
                if (count == zoomCounter) {
                    chart(svg);
                }
            }, 100);
        });
    
        var chart = function(_svg) {
            if (!arguments.length) return svg;
            svg = _svg;
            var domain = chart.datum().map(chart.xPlot());
            if (!domain.length) return chart;
            var ease = d3.ease('cube-in-out');
            svg.transition().ease(ease).tween("axis", function(){
                var x0 = chart.x().copy();
                var y0 = chart.y().copy();
                var yDomain = ydomain(x0, chart.innerWidth(), series, chart.y().domain());
                if (Math.sign(yDomain[0]) == Math.sign(yDomain[yDomain.length-1])) {
                    chart.yAxis().tickValues(d3.scale.linear().domain(yDomain).range(chart.y().range()).ticks(20));
                } else {
                    chart.y(d3.scale.linear().domain(yDomain).range([height-margin.bottom-margin.top,0]));
                }
                var y = y0.domain(yDomain);
                return function(t) {
                    if (chart.datum().length != domain.length) return;
                    var range = xrange(x0, domain, chart.innerWidth());
                    var x = chart.x().domain(domain).range(domain.map(function(d,i){
                        var from = x0(d);
                        var to = range[i];
                        var e = ease(t);
                        return from + (to - from) * e;
                    }));
                    y.domain(yDomain.map(function(to){
                        var from = y0.invert(y(to));
                        var e = ease(t);
                        return from + (to - from) * e;
                    }));
                    chart.x(x);
                    chart.y(y);
                    redraw();
                };
            }).each("end", function(){
                if (chart.datum().length != domain.length) return;
                var range = xrange(chart.x(),domain,chart.innerWidth());
                chart.x(chart.x().domain(domain).range(range));
                var yDomain = ydomain(x, chart.innerWidth(), series, chart.y().domain());
                chart.y(chart.y().domain(yDomain));
                redraw();
            });
            return chart;
        };
        chart.select = function() {
            return grid.select.apply(grid, arguments);
        };
        chart.selectAll = function() {
            return grid.selectAll.apply(grid, arguments);
        };
        chart.margin = function(_margin) {
            if (!arguments.length) return margin;
            mangin = _.extend(margin, _margin);
            chart.width(width);
            chart.height(height);
            return chart;
        };
        chart.width = function(_) {
            if (!arguments.length) return width;
            var innerWidth = chart.innerWidth();
            var _innerWidth = _ - margin.left - margin.right;
            if (isNaN(_innerWidth)) throw Error("Not a valid width: " + _);
            x.range(x.range().map(function(point){
                return point * _innerWidth / innerWidth;
            }));
            width = _;
            svg.attr("width", width);
            pane.attr("width", width);
            chart.x(x);
            return chart;
        };
        chart.innerWidth = function(_) {
            if (!arguments.length) return width - margin.left - margin.right;
            return chart.width(_ + margin.left + margin.right);
        };
        chart.height = function(_) {
            if (!arguments.length) return height;
            height = _;
            svg.attr("height", height);
            pane.attr("height", height);
            y.range([height - margin.top - margin.bottom, 0]);
            chart.y(y);
            return chart;
        };
        chart.innerHeight = function(_) {
            if (!arguments.length) return height - margin.top - margin.bottom;
            return chart.height(_ + margin.top + margin.bottom);
        };
        chart.x = function(_x) {
            if (!arguments.length) return x;
            x = _x;
            var domain = x.domain();
            var earliest = domain[0];
            var latest = domain[domain.length-1];
            var d = moment(latest).diff(earliest);
            var range = x.range();
            var left = range[0];
            var right = range[range.length-1];
            var width = right - left;
            x.domain([].concat(
                moment(earliest).subtract(d*1.25,'ms').toDate(),
                moment(earliest).subtract(d/4,'ms').toDate(),
                domain,
                moment(latest).add(d/4,'ms').toDate(),
                moment(latest).add(d*1.25,'ms').toDate()
            )).range([].concat(
                left - width*1.5,
                left - width/2,
                range,
                right + width/2,
                right + width*1.5
            ));
            x_orig = x.copy();
            var x_trim = x.copy();
            if (range.length > 2) {
                var start = _.sortedIndex(range, 0);
                var end = _.sortedIndex(range, chart.innerWidth()+1);
                if (start < end - 1) {
                    x_trim.domain([].concat(
                        x.invert(0),
                        domain.slice(start, end),
                        x.invert(chart.innerWidth())
                    )).range([].concat(
                        0,
                        range.slice(start, end),
                        chart.innerWidth()
                    ));
                }
            }
            zoom.x(x_trim);
            xAxis.scale(x_trim);
            return chart.y(y);
        };
        chart.y = function(_y) {
            if (!arguments.length) return y;
            y = _y;
            yAxis.scale(y);
            return chart;
        };
        chart.xAxis = function(_) {
            if (!arguments.length) return xAxis;
            xAxis = _;
            return chart;
        };
        chart.yAxis = function(_) {
            if (!arguments.length) return yAxis;
            yAxis = _;
            return chart;
        };
        chart.scaleExtent = zoom.scaleExtent.bind(zoom);
        chart.zoomstart = function(listener) {
            if (!arguments.length) return listeners.zoomstart;
            listeners.zoomstart = listener;
            return chart;
        };
        chart.zoom = function(listener) {
            if (!arguments.length) return listeners.zoom;
            listeners.zoom = listener;
            return chart;
        };
        chart.zoomend = function(listener) {
            if (!arguments.length) return listeners.zoomend;
            listeners.zoomend = listener;
            return chart;
        };
        chart.xPlot = function(_xIteratee) {
            if (!arguments.length) return xIteratee;
            xIteratee = _.iteratee(_xIteratee);
            return chart.x(x);
        };
        chart.datum = function(_datum) {
            if (!arguments.length) return datum;
            if (!Array.isArray(_datum)) throw Error("datum must be an Array");
            datum = _datum;
            return chart;
        };
        chart.series = function(cls, _) {
            if (!arguments.length) return series;
            if (arguments.length == 1) return series[cls];
            _ ? series[cls] = _.chart(chart) : delete series[cls];
            return chart.y(y);
        };
        chart.rule = function(_) {
            if (!arguments.length) return yRule;
            yRule = _;
            return chart;
        };
        return chart;

        function scaleChart(focal, xfocal) {
            var scale = zoom.scale();
            var offset = zoom.translate()[0];
            var end = x_orig(new Date());
            if (end * scale + offset < chart.innerWidth()) {
                if (focal && xfocal) {
                    var mid = x_orig(focal);
                    if (end != mid) {
                        scale = (chart.innerWidth() - xfocal) / (end - mid);
                        zoom.scale(scale);
                    }
                }
                offset = chart.innerWidth() - end * scale;
                zoom.translate([offset, zoom.translate()[1]]);
            }
            if (scale && (offset || offset === 0)) {
                chart.x().range(x_orig.range().map(function(x){
                    return x * scale + offset;
                }));
            }
            return chart;
        }

        function redraw() {
            svg.attr("width", width);
            svg.attr("height", height);
            var clipRect = svg.select("defs rect").node();
            if (clipRect) {
                clipRect.parentElement.setAttribute("id", clip);
                d3.select(clipRect)
                    .attr("x", 0).attr("y", 0)
                    .attr("width", width - margin.left - margin.right)
                    .attr("height", height - margin.top - margin.bottom);
            }
            updateAll(svg, "g", "y axis").attr("transform", f('translate', chart.innerWidth() + margin.left, margin.top)).call(yAxis)
                .selectAll("line").attr("x1", -chart.innerWidth());
            var axis = updateAll(svg, "g", "x axis").attr("transform", f('translate', margin.left, chart.innerHeight() + margin.top)).call(xAxis);
            axis.selectAll("line").attr("y1", -chart.innerHeight());
            var x1, n1, s1,s0;
            axis.selectAll("text").each(function(d,i){
                // remove overlapping ticks
                var overlap = x1 && i > 0 && x1 > chart.x()(d);
                var formatted = moment(d).format();
                if (overlap && !significant(s0,s1,formatted)) {
                    d3.select(this.parentElement).attr("style", "opacity:0;");
                } else {
                    if (overlap) {
                        d3.select(n1).attr("style", "opacity:0;");
                    }
                    s0 = s1;
                    s1 = formatted;
                    n1 = this.parentElement;
                    x1 = chart.x()(d) + this.getComputedTextLength();
                }
            });
            grid = updateAll(svg, "g", "grid")
                .attr("transform", f('translate', margin.left, margin.top))
                .attr("clip-path", f('url', '#' + clip));
            _.each(series, function(mark, cls){
                updateAll(grid, "g", cls).call(mark);
            });
            pane = updateAll(svg, "rect", "pane")
                .attr("x", margin.left)
                .attr("y", margin.top)
                .attr("width", width - margin.left - margin.right)
                .attr("height", height - margin.top - margin.bottom)
                .call(zoom);
            updateAll(svg, "g", "rule").call(function(rule){
                var domain = chart.y().domain();
                yRule = Math.max(domain[0], Math.min(domain[domain.length-1], yRule));
                var y = chart.y()(yRule);
                rule.attr("transform", f('translate', chart.innerWidth() + margin.left, y+margin.top));
                updateAll(rule, "line").attr("x1", -chart.innerWidth()).attr("x2", 6);
                updateAll(rule, "text").call(function(text){
                    text.attr("x",  9).attr("dy", ".32em").attr("style", "text-anchor:start;").text(yRule);
                    var rhalf = text.node().getBBox().height/2;
                    svg.selectAll("g.y.axis .tick").each(function(d){
                        var dy = chart.y()(d);
                        var half = this.getBBox().height/2;
                        if (dy - half < y + rhalf && dy + half > y - rhalf) {
                            d3.select(this).attr("style", "opacity:0;");
                        }
                    });
                });
                updateAll(rule, "rect", "pane")
                    .attr("x", -chart.innerWidth())
                    .attr("y", -10)
                    .attr("width", chart.innerWidth() + margin.right)
                    .attr("height", 20)
                    .call(drag);
            });
            return chart;
        }
    };

    d3.chart.series = {
        bar: function(iteratee) {
            iteratee = _.iteratee(iteratee);
            var series = buildSeries(function(g){
                var x = series.x(), y = series.y(), datum = series.datum(), xIteratee = series.xPlot();
                var range = x(xIteratee(datum[datum.length-1],datum.length-1)) - x(xIteratee(datum[0],0));
                var width = Math.max(Math.floor((range) / datum.length), 2);
                updateAll(g, "rect", "bar", datum).attr("x", function(d, i){
                    return x(xIteratee(d,i)) - width / 2;
                }).attr("y", _.compose(y, iteratee)).attr("width", width).attr("height", function(d,i){
                    return series.chart().innerHeight() - y(iteratee(d,i));
                });
            }, function(datum, callback) {
                return datum.forEach(function(data, i){
                    callback(iteratee(data,i),i);
                });
            });
            return series;
        },
        line: function(iteratee) {
            iteratee = _.iteratee(iteratee);
            var series = buildSeries(function(g){
                var x = series.x(), y = series.y(), datum = series.datum(), xIteratee = series.xPlot();
                var line = d3.svg.line().x(_.compose(x,xIteratee)).y(_.compose(y,iteratee));
                updateAll(g, "path").datum(datum).attr("d", line);
            }, function(datum, callback) {
                return datum.forEach(function(data, i){
                    callback(iteratee(data,i),i);
                });
            });
            return series;
        },
        band: function(high, low) {
            high = _.iteratee(high);
            low = _.iteratee(low);
            var series = buildSeries(function(g) {
                var x = series.x(), y = series.y(), datum = series.datum(), xIteratee = series.xPlot();
                var area = d3.svg.area().x(_.compose(x,xIteratee)).y0(_.compose(y,high)).y1(_.compose(y,low));
                updateAll(g, "path").datum(datum).attr("d", area);
            }, function(datum, callback) {
                return datum.forEach(function(data, i){
                    callback(low(data,i),i);
                    callback(high(data,i),i);
                });
            });
            return series;
        },
        ohlc: function(open, high, low, close) {
            open = _.iteratee(open);
            high = _.iteratee(high);
            low = _.iteratee(low);
            close = _.iteratee(close);
            var series = buildSeries(function(g) {
                var x = series.x(), y = series.y(), datum = series.datum(), xIteratee = series.xPlot();
                updateAll(g, "path", "ohlc", datum).attr("d", function(d,i){
                    return [
                        'M', (x(xIteratee(d,i)) - 2), y(open(d,i)),
                        'L', x(xIteratee(d,i)), y(open(d,i)),
                        'M', x(xIteratee(d,i)), y(high(d,i)),
                        'L', x(xIteratee(d,i)), y(low(d,i)),
                        'M', x(xIteratee(d,i)), y(close(d,i)),
                        'L', (x(xIteratee(d,i)) + 2), y(close(d,i))
                    ].join(' ');
                });
            }, function(datum, callback) {
                return datum.forEach(function(data, i){
                    callback(open(data,i),i);
                    callback(low(data,i),i);
                    callback(high(data,i),i);
                    callback(close(data,i),i);
                });
            });
            return series;
        }
    };

    function buildSeries(series, domainFn) {
        var datum, xIteratee, x, y;
        var chart = d3.chart();
        series.chart = function(_) {
            if (!arguments.length) return chart;
            chart = _;
            return series;
        };
        series.points = function(xDomain, callback) {
            if (y) return;
            var datum = series.datum();
            var xIteratee = series.xPlot();
            var mapped = datum.map(xIteratee);
            var start = _.sortedIndex(mapped, xDomain[0]);
            var end = _.sortedIndex(mapped, xDomain[xDomain.length-1]);
            var visible = datum.slice(start, end+1);
            return domainFn(visible, callback);
        };
        series.x = function(_) {
            if (!arguments.length) return x || chart.x();
            x = _;
            return series;
        };
        series.y = function(_) {
            if (!arguments.length) return y || chart.y();
            y = _;
            return series;
        };
        series.xPlot = function(_xIteratee) {
            if (!arguments.length) return xIteratee || chart.xPlot();
            xIteratee = _.iteratee(_xIteratee);
            return series;
        };
        series.datum = function(_datum) {
            if (!arguments.length) return datum || chart.datum();
            if (!Array.isArray(_datum)) throw Error("datum must be an Array");
            datum = _datum;
            return series;
        };
        series.remove = function() {
            var hash = chart.series();
            for (var cls in hash) {
                if (hash[cls] === series) {
                    chart.selectAll('.' + cls.replace(/ /g, '.')).remove();
                    delete hash[cls];
                }
            }
            return series;
        };
        return series;
    }

    function xrange(scale, domain, width) {
        var range = scale.range();
        var d = scale.domain();
        var d1 = Math.max(Math.min(_.sortedIndex(domain, scale.invert(0)), domain.length-10),0);
        var d2 = Math.min(_.sortedIndex(domain, scale.invert(width)), domain.length-1);
        var s2 = scale.invert(width).valueOf() > Date.now() ? width / scale(new Date()) : 1;
        var step = s2 * Math.max(scale(domain[d2]) - scale(domain[d1]), 100) / Math.max(d2 - d1, 10);
        var offset = scale(domain[d1]) - d1 * step;
        return _.range(offset, offset + domain.length *step, step);
    }

    function ydomain(x, width, series, domain) {
        var xDomain = [x.invert(0), x.invert(width)];
        var yDomain = _.reduce(series, function(yDomain, series){
            series.points(xDomain, function(point){
                if (isFinite(point) && point && (point < yDomain[0] || yDomain[0] === 0)) {
                    yDomain[0] = point;
                }
                if (isFinite(point) && point && (point > yDomain[1] || yDomain[1] === 100)) {
                    yDomain[1] = point;
                }
            });
            return yDomain;
        }, [0, 100]);
        if (_.isEqual(yDomain, [0,100])) return domain;
        return yDomain;
    }

    function updateAll(chart, tag, cls, data){
        var selector = cls ? (tag + '.' + cls.replace(/ /g, '.')) : tag;
        var existing = chart.selectAll(selector).data(data || [undefined]);
        var created = existing.enter().append(tag);
        if (cls) created.attr("class", cls);
        existing.exit().remove();
        return chart.selectAll(selector);
    }

    function significant(s0,s1,s2) {
        if (!s0) return false;
        for (var i=0;i<s0.length;i++) {
            if (s0.charAt(i) != s1.charAt(i) && s1.charAt(i) == s2.charAt(i))
                return false;
            if (s0.charAt(i) != s2.charAt(i) && s0.charAt(i) != s1.charAt(i))
                return false;
            if (s0.charAt(i) != s2.charAt(i))
                return true;
            if (s0.charAt(i) != s1.charAt(i))
                return false;
        }
        return false;
    }

    function f(name) {
        return [name, '(', Array.prototype.join.call(Array.prototype.slice.call(arguments,1), ','), ')'].join('');
    }
})(d3);