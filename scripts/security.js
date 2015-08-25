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
    $('.show-indicator-modal').click(function(event){
        event.preventDefault();
        $('#indicator-id').val('i' + new Date().valueOf().toString(16));
        $('#forIndicator').prop('selectize').clear();
        $('#differenceFrom').prop('selectize').clear();
        $('#percentOf').prop('selectize').clear();
        $('#lower').val('');
        $('#upper').val('');
        $('#style').val('line');
        $('#color').prop('selectize').setValue('black');
        $('#add-indicator-modal').modal('show');
    });
    $('#add-indicator-modal').modal({
        show: false
    }).on('shown.bs.modal', function () {
        // TODO list charts in #position
    });
    $('#color').selectize({
        render: {
            option: function(data, escape) {
                return '<div><span style="color:' + data.value + '" class="glyphicon glyphicon-stats"></span> ' + data.text + '</div>';
            },
            item: function(data, escape) {
                return '<div><span style="color:' + data.value + '" class="glyphicon glyphicon-stats"></span> ' + data.text + '</div>';
            }
        }
    });
    screener.listUnits().then(function(units){
        return _.pluck(units, 'label');
    }).then(function(units){
        return screener.listIntervals().then(function(intervals){
            return _.pluck(intervals, 'label');
        }).then(function(intervals){
            return screener.listIndicators().then(function(indicators){
                var zero = +('1' + (units.length * intervals.length));
                return indicators.map(function(i){
                    return {
                        value: i.iri,
                        text: i.label,
                        expression: i.expression,
                        optgroup: i.interval.label + ' ' + i.unit.label,
                        optorder: (units.indexOf(i.unit.label) + intervals.indexOf(i.interval.label) * units.length) + zero,
                        title: i.comment
                    };
                });
            });
        });
    }).then(function(items){
        return _.sortBy(_.sortBy(items, 'text'), 'optorder');
    }).then(function(items){
        $('select[name="indicator"]').selectize({
            searchField: ['text', 'title', 'expression'],
            sortField: [{field:'optorder'}, {field:'text'}],
            options: items,
            optgroups: _.uniq(_.pluck(items, 'optgroup')).map(function(optgroup){
                return {
                    value: optgroup,
                    label: optgroup,
                    references: items.filter(function(item){
                        return item.optgroup == optgroup;
                    })
                };
            }),
            render: {
                item: function(data, escape) {
                    return '<div title="' + escape(data.title || '') + '">' + escape(data.text) + '</div>';
                }
            }
        });
        $('#hasIndicator').change(function(event){
            var value = $(event.target).val();
            if (!value || !event.target.selectize) return;
            var option = event.target.selectize.options[value];
            var optgroup = event.target.selectize.optgroups[option.optgroup];
            $(event.target).closest("form").find('select[name="indicatorReference"]').toArray().forEach(function(select){
                var item = $(select).val();
                select.selectize.clearOptions();
                select.selectize.addOption(optgroup.references);
                select.selectize.addItem(item);
                select.selectize.refreshOptions(false);
            });
        }).change();
    });

    return Promise.resolve(window.location.href.substring(0, window.location.href.indexOf('?'))).then(function(security){
        return setTitleToSecurity(security).then(function(){
            return screener.listIntervals();
        }).then(function(list){
            return _.pluck(list, 'value');
        }).then(function(list){
            return _.without(list, 'annual','quarter');
        }).then(function(list){
            return list.reverse();
        }).then(function(intervals){
            var chart = d3.chart();
            return mapEachSeries(addSeries.bind(this, chart)).then(function(){
                var redraw = drawOhlcChartData(intervals, security, chart);
                $('#add-indicator-btn').click(function(event){
                    var style = $('#style').val();
                    var color = $('#color').val();
                    var id = $('#indicator-id').val();
                    addSeries(chart, {
                        forIndicator: $('#forIndicator').val(),
                        differenceFrom: $('#differenceFrom').val(),
                        percentOf: $('#percentOf').val(),
                        lower: $('#lower').val(),
                        upper: $('#upper').val(),
                        style: style,
                        color: color,
                        id: id,
                        className: style + " " + color + " " + id
                    }).then(function(){
                        $('#add-indicator-modal').modal('hide');
                        redraw();
                    });
                });
            });
        });
    }).catch(calli.error);

    function addSeries(chart, series){
        return screener.inlineFilters([series]).then(function(array){
            return array[0];
        }).then(function(series){
            var old = refreshSeries(series);
            if (old && chart.series(old.className)) {
                chart.series(old.className).remove();
                $('#h6-' + old.id + ' .glyphicon-eye-close').toggleClass("glyphicon-eye-close glyphicon-eye-open");
                $('#h6-' + old.id + '>span').text(getSeriesLabel(series));
                $('#h6-' + old.id).attr("class", series.color);
            } else {
                $('#indicator-list').append($('<h6></h6>', {
                    "id": 'h6-' + series.id,
                    "class": series.color
                }).append(
                    $('<span></span>').text(getSeriesLabel(series))
                ).append(
                    $('<small></small>', {
                        "class": "settings"
                    }).append(' ').append($('<a></a>', {
                        "class": "glyphicon glyphicon-eye-open"
                    }).click(function(event){
                        event.preventDefault();
                        $(event.target).toggleClass("glyphicon-eye-close glyphicon-eye-open");
                        if ($(event.target).hasClass("glyphicon-eye-open")) {
                            $('.' + series.id).show();
                        } else {
                            $('.' + series.id).hide();
                        }
                    })).append(' ').append($('<a></a>', {
                        "class": "glyphicon glyphicon-cog"
                    }).click(function(event){
                        event.preventDefault();
                        var s = refreshSeries(series);
                        $('#indicator-id').val(s.id);
                        $('#forIndicator').prop('selectize').setValue(s.forIndicator);
                        $('#differenceFrom').prop('selectize').setValue(s.differenceFrom);
                        $('#percentOf').prop('selectize').setValue(s.percentOf);
                        $('#lower').val(s.lower);
                        $('#upper').val(s.upper);
                        $('#style').val(s.style);
                        $('#color').prop('selectize').setValue(s.color);
                        $('#add-indicator-modal').modal('show');
                    })).append(' ').append($('<a></a>', {
                        "class": "glyphicon glyphicon-remove"
                    }).click(function(event){
                        event.preventDefault();
                        screener.setItem("series", JSON.stringify(getArrayOfSeries().filter(function(item){
                            if (series.id != item.id) return true;
                            chart.series(series.className).remove();
                            $('#h6-' + series.id).remove();
                            return false;
                        })));
                    })).append(' ')
                ));
            }
        }).then(function(){
            var array = getArrayOfSeries();
            var idx = _.findIndex(array, function(item) {
                return item.id == series.id;
            });
            if (idx < 0) {
                array = array.concat(series);
            } else {
                array.splice(idx, 1, series);
            }
            screener.setItem("series", JSON.stringify(array));
        });
    }

    function getSeriesLabel(series) {
        var label = series.indicator ? series.indicator.label : 'Price';
        var suffix = series.percent && series.style != 'band' ? ' %' : series.difference ? ' Δ' : '';
        return label + suffix;
    }

    function setTitleToSecurity(security) {
        return screener.listExchanges().then(function(result){
            return result.filter(function(exchange){
                return window.location.href.indexOf(exchange.iri) === 0;
            })[0];
        }).then(function(exchange){
            var ticker = security.substring(exchange.iri.length + 1);
            return screener.lookup(ticker, exchange).then(function(results){
                if (results.length && results[0].ticker == ticker)
                    return results[0].name;
                else return ticker;
            });
        }).then(function(title){
            $('title').text(title);
            $('#page-title').text(title);
            return security;
        });
    }

    function getArrayOfSeries() {
        var json = null;
        try {
            json = JSON.parse(screener.getItem("series"));
        } catch(e) {
            console.log(screener.getItem("series"));
            console.log(e);
        }
        if (!_.isEmpty(json)) return json;
        var id = 'i' + new Date().valueOf().toString(16);
        var array = [{
            style: "ohlc",
            color: "black",
            id: id,
            className: "ohlc black " + id
        }];
        screener.setItem("series", JSON.stringify(array));
        return array;
    }

    function mapEachSeries(fn) {
        var json = getArrayOfSeries();
        return screener.inlineFilters(json).then(function(json){
            return Promise.all(json.map(fn));
        });
    }

    function refreshSeries(toBeRefreshed) {
        return _.find(getArrayOfSeries(), function(series){
            return series.id == toBeRefreshed.id;
        });
    }

    function drawOhlcChartData(intervals, security, chart) {
        var asof = function(datum) {
            return new Date(datum.asof);
        };
        var interval = screener.getItem("security-chart-interval", 'd1');
        var width = document.documentElement.clientWidth;
        var height = Math.max(200,Math.min(document.documentElement.clientHeight,800));
        chart.width(width).height(height).xPlot(asof);
        $(window).resize(function(){
            chart.width(document.documentElement.clientWidth);
            d3.select('#ohlc-div').call(chart);
        });
        var loaded = new Date();
        var redrawCounter = 0;
        var redraw = _.debounce(function(force, delay){
            var begin = chart.x().invert(0);
            var end = chart.x().invert(chart.innerWidth());
            var data = chart.datum();
            var int = optimalInterval(intervals, interval, chart);
            screener.setItem("security-chart-interval", interval);
            screener.setItem("security-chart-length", data.length);
            if (force || !data.length || int != interval ||
                    begin.valueOf() < chart.xPlot()(data[0]).valueOf() ||
                    loaded.valueOf() < end.valueOf()) {
                var counter = ++redrawCounter;
                drawing = drawing.then(function(){
                    if (counter != redrawCounter) return;
                    console.log("Loading", int, begin, end);
                    return loadChartData(chart, security, intervals, int, begin, end).then(function(){
                        interval = int;
                        loaded = new Date(Math.min(Date.now(), end.valueOf()));
                        if (delay || int == optimalInterval(intervals, int, chart)) {
                            d3.select('#ohlc-div').call(chart);
                        }
                        _.delay(function(){
                            redraw(false, (delay || 500)*2); // check if more adjustments are needed
                        }, delay || 0);
                    }, function(error){
                        calli.error(error);
                    });
                });
            }
        }, 500);
        var length = Math.max(+screener.getItem("security-chart-length", 250), 100);
        var drawing = screener.load(security, ['asof'], interval, length, loaded).then(function(data){
            return loadChartData(chart, security, intervals, interval, data[0].asof, data[data.length-1].asof);
        }).then(function(){
            var data = chart.datum();
            chart.x(chart.x().domain([new Date(data[0].asof), new Date()]).range([0,chart.innerWidth()]));
            return data;
        }).then(function(){
            return screener.load(security, ['close'], 'd1', 1, loaded);
        }).then(function(data){
            chart.rule(data[0].close);
        }).then(function(){
            d3.select('#ohlc-div').call(chart);
            redraw(false);
        });
        chart.zoomend(redraw.bind(this, false));
        return redraw.bind(this, true);
    }

    function loadChartData(chart, security, intervals, interval, lower, upper) {
        var earliest = {asof: new Date().toISOString()};
        return screener.load(security, ['asof', 'low', 'open', 'close', 'high', 'volume'], interval, 1, lower, upper).then(function(data){
            if (data.length) earliest.asof = data[0].asof;
            chart.datum(data);
            var ppp = chart.innerWidth()/data.length;
            if (interval.charAt(0) == 'm') {
                var m = parseInt(interval.substring(1), 10);
                chart.scaleExtent([Math.min(m/(30 * 60) /ppp*5,1), Math.max(m/1 /ppp*5,1)]);
            } else {
                var d = parseInt(interval.substring(1), 10);
                chart.scaleExtent([Math.min(d/5 /ppp*5,1), Math.max(d*6.5*60 /ppp*5,1)]);
            }
        }).then(function(){
            return mapEachSeries(function(series){
                if (series.indicator && intervals.indexOf(series.indicator.interval.value) < intervals.indexOf(interval)) {
                    if (chart.series(series.className)) chart.series(series.className).datum([]);
                } else return Promise.resolve(['asof', 'open', 'high', 'low', 'close'].concat(_.pluck(_.compact(
                    [series.indicator, series.difference, series.percent]
                ), 'expression'))).then(function(expressions){
                    if (!series.indicator) return undefined;
                    return screener.load(security, expressions, series.indicator.interval.value, 1, lower, upper).then(function(data){
                        return data.slice(Math.max(_.sortedIndex(data, earliest, 'asof')-1,0));
                    });
                }).then(function(data){
                    var transform = function(expression) {
                        return function(point) {
                            var value = point[expression];
                            var diff = series.difference ? point[series.difference.expression] : 0;
                            var per = series.percent ? point[series.percent.expression] : 100;
                            return (value - diff) *100 / per;
                        };
                    };
                    var primary = transform(series.indicator ? series.indicator.expression : 'close');
                    if (series.style == 'line') {
                        chart.series(series.className, d3.chart.series.line(primary).xPlot(chart.xPlot()));
                    } else if (series.style == 'bar') {
                        chart.series(series.className, d3.chart.series.bar(primary).xPlot(chart.xPlot()));
                    } else if (series.style == 'band') {
                        var band = function(percent) {
                            return function(point) {
                                var value = series.indicator ? point[series.indicator.expression] : point.close;
                                var diff = series.difference ? point[series.difference.expression] : 0;
                                var per = series.percent ? point[series.percent.expression] : 100;
                                return percent * per /100 + value - diff;
                            };
                        };
                        chart.series(series.className, d3.chart.series.band(band(series.lower), band(series.upper)).xPlot(chart.xPlot()));
                    } else if (series.style == 'ohlc') {
                        var ohlc = d3.chart.series.ohlc(transform('open'), transform('high'), transform('low'), transform('close'));
                        chart.series(series.className, ohlc.xPlot(chart.xPlot()));
                    } else {
                        console.error("Unknown series style " + series.style);
                    }
                    var unit = series.percent && series.style != 'band' ? 'percent' : series.indicator ? series.indicator.unit.value : 'price';
                    if (unit == 'percent') {
                        var values = data.map(primary);
                        var domain = [Math.min(_.min(values), 0), Math.max(_.max(values), 0)];
                        if (unit == 'percent' && domain[0] < 0) {
                            domain[0] = Math.min(domain[0], -100);
                        }
                        if (unit == 'percent' && domain[1] > 0) {
                            domain[1] = Math.max(domain[1], 100);
                        }
                        var y = d3.scale.linear().range(chart.y().range()).domain(domain);
                        chart.series(series.className).y(y);
                    } else if (unit != 'price') {
                        var values = data.map(primary);
                        var domain = [_.min(values), _.max(values)];
                        if (unit == 'percent' && domain[0] < 0) {
                            domain[0] = Math.min(domain[0], -100);
                        } else {
                            domain[0] = Math.min(domain[0], 0);
                        }
                        if (unit == 'percent' && domain[1] > 0) {
                            domain[1] = Math.max(domain[1], 100);
                        } else {
                            domain[1] = Math.max(domain[1], 0);
                        }
                        var y = d3.scale.linear().range(chart.y().range()).domain(domain);
                        chart.series(series.className).y(y);
                    }
                    if (data) {
                        chart.series(series.className).datum(data);
                    }
                });
            });
        }).then(function(){
            console.log("Loaded", interval, chart.datum().length, chart.datum()[0] && chart.datum()[0].asof);
        }, calli.error);
    }

    function optimalInterval(intervals, interval, chart) {
        var begin = chart.x().invert(0);
        var end = chart.x().invert(chart.innerWidth());
        var data = chart.datum();
        var i = Math.max(Math.min(_.sortedIndex(data, {asof: begin.toISOString()}, chart.xPlot()), data.length-10),0);
        var j = Math.max(Math.min(_.sortedIndex(data, {asof: end.toISOString()}, chart.xPlot()), data.length-1),0);
        var size = j - i;
        var x = _.compose(chart.x(), chart.xPlot());
        var width = x(data[j], j) - x(data[i], i);
        var intervalMinutes = intervals.map(function(interval){
            if (interval.charAt(0) == 'm') {
                return parseInt(interval.substring(1), 10);
            } else {
                var d = parseInt(interval.substring(1), 10);
                return d * 900;
            }
        });
        if (!size) return interval;
        var index = intervals.indexOf(interval);
        var minutes = size * intervalMinutes[intervals.indexOf(interval)];
        var value = Math.round(minutes / width) * 5;
        var i = _.sortedIndex(intervalMinutes, value);
        if (i > 0 && value - intervalMinutes[i-1] < intervalMinutes[i] - value) i--;
        return intervals[Math.min(Math.max(i,0),intervalMinutes.length-1)];
    }
});