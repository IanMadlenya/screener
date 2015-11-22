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

    setTitleToSecurity(window.location.href.substring(0, window.location.href.indexOf('?')));

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

    getArrayOfSortedSeries().reduce(function(promise, series){
        return promise.then(addSeries.bind(this, series, _.noop));
    }, Promise.resolve()).then(getIntervals).then(function(intervals){
        var security = window.location.href.substring(0, window.location.href.indexOf('?'));
        var blocks = [];
        var redraw = function(){
            var graphics = $('.chart').find('svg').toArray();
            blocks.push.apply(blocks, graphics.filter(function(svg){
                return _.pluck(blocks, 'svg').indexOf(svg) < 0;
            }).map(function(svg){
                var first = $(svg).closest('.chart').find('.series').first();
                var block = {
                    svg: svg,
                    chart: d3.chart(),
                    unit: first.data("unit"),
                    id: first.data("id")
                };
                block.redraw = drawOhlcChartData(intervals, security, block);
                return block;
            }));
            return Promise.all(blocks.map(function(block){
                _.keys(block.chart.series()).filter(function(cls){
                    var id = cls.replace(/.* /,'');
                    if (!$('#series-' + id).length) {
                        delete block.chart.series()[cls];
                    }
                });
                return block.redraw();
            }));
        };
        $('#add-indicator-btn').click(function(event){
            var style = $('#style').val();
            var color = $('#color').val();
            var id = $('#indicator-id').val();
            var position = $('#position').val() || id;
            var placement = position == id ? 'with' : $('#placement').val();
            addSeries({
                forIndicator: $('#forIndicator').val(),
                differenceFrom: $('#differenceFrom').val(),
                percentOf: $('#percentOf').val(),
                lower: $('#lower').val(),
                upper: $('#upper').val(),
                style: style,
                color: color,
                id: id,
                placement: placement,
                position: position,
                className: style + " " + color + " " + id
            }, redraw).then(function(){
                screener.setItem("series", JSON.stringify(getArrayOfSeriesInDOM()));
            }).then(function(series){
                $('#add-indicator-modal').modal('hide');
            }).catch(calli.error);
        });
        return redraw();
    }).catch(calli.error);

    function addSeries(series, redraw){
        var populatePosition = function() {
            var ordered = $('#charts').find(".chart").toArray().map(function(chart){
                var first = $(chart).find('.series').first();
                return {
                    value: first.data("id"),
                    text: first.find('.text').text()
                };
            });
            $('#position').empty().append(ordered.map(function(opt){
                return $('<option></option>', {
                    value: opt.value
                }).text(opt.text);
            })).val($(chartBlock).find('.series').first().data("id"));
        };
        var withChart = series.placement == 'with' ? $('#series-' + series.position).closest('.chart') : $();
        var chartBlock = withChart.length ? withChart : $('<div></div>', {
            "class": "chart"
        }).append($('<div></div>', {
            "class": "indicator-list"
        }).append($('<a></a>', {
            href: "javascript:void(0)"
        }).append($('<span></span>',{
            "class": "glyphicon glyphicon-plus"
        })).click(function(event){
            event.preventDefault();
            $('#indicator-id').val('i' + new Date().valueOf().toString(16));
            $('#forIndicator').prop('selectize').clear();
            $('#differenceFrom').prop('selectize').clear();
            $('#percentOf').prop('selectize').clear();
            $('#lower').val('');
            $('#upper').val('');
            $('#style').val('line');
            $('#color').prop('selectize').setValue('black');
            $('#placement').val('with');
            populatePosition();
            $('#add-indicator-modal').modal('show');
        }))).append(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
        var list = chartBlock.children('.indicator-list');
        if (!$('#charts').children('.chart').length) {
            list.prepend($('#page-title'));
        }
        var span = $('<span></span>', {
            "class": "text"
        });
        var seriesHeading = $('<h6></h6>', {
            id: "series-" + series.id,
            "class": "series " + series.color
        }).data(_.omit(series, 'placement', 'position')).append(span).append(' ').append($('<span></span>', {
            "class": "value"
        })).append(' ').append(
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
                $('#add-indicator-modal').modal('show');
                var s = seriesHeading.data();
                $('#indicator-id').val(s.id);
                $('#forIndicator').prop('selectize').setValue(s.forIndicator);
                $('#differenceFrom').prop('selectize').setValue(s.differenceFrom);
                $('#percentOf').prop('selectize').setValue(s.percentOf);
                $('#lower').val(s.lower);
                $('#upper').val(s.upper);
                $('#style').val(s.style);
                $('#color').prop('selectize').setValue(s.color);
                $('#placement').val('with');
                populatePosition();
            })).append(' ').append($('<a></a>', {
                "class": "glyphicon glyphicon-remove"
            }).click(function(event){
                event.preventDefault();
                var title = $('#page-title');
                seriesHeading.remove();
                $('.' + series.id).remove();
                screener.setItem("series", JSON.stringify(getArrayOfSeriesInDOM()));
                if (list.children('h6').length < 1) {
                    chartBlock.remove();
                    if ($('.indicator-list').length) {
                        $('.indicator-list').first().prepend(title);
                    } else {
                        window.location.reload(); // no more charts
                    }
                }
                redraw();
            })).append(' ')
        );
        if (series.placement == 'before') {
            $('.' + series.position).closest('.chart').before(chartBlock);
        } else if (series.placement == 'after') {
            $('.' + series.position).closest('.chart').after(chartBlock);
        } else if (!withChart.length) {
            $('#charts').append(chartBlock);
        }
        var existing = $('#series-' + series.id);
        if (existing.length && list.toArray().indexOf(existing) >= 0) {
            existing.replaceWith(seriesHeading);
        } else {
            if (existing.closest('.indicator-list').children('h6').length < 2) {
                var title = $('#page-title');
                $(existing).closest('.chart').remove();
                if ($('.indicator-list').length) {
                    $('.indicator-list').first().prepend(title);
                }
            }
            existing.remove();
            $('.' + series.id).remove();
            list.children('a').before(seriesHeading);
        }
        return screener.inlineFilters([series]).then(_.first).then(function(series){
            span.text(getSeriesLabel(series));
            seriesHeading.data("unit", getSeriesUnit(series));
            return series;
        }).then(redraw);
    }

    function getSeriesLabel(series) {
        var label = series.indicator ? series.indicator.label : 'Price';
        var suffix = series.percent && series.style != 'band' ? ' %' : series.difference ? ' Δ' : '';
        return label + suffix;
    }

    function getSeriesUnit(series) {
        return series.percent && series.style != 'band' ? 'percent' : series.indicator ? series.indicator.unit.value : 'price';
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
        }).catch(calli.error);
    }

    function getIntervals() {
        return screener.listIntervals().then(function(list){
            return _.indexBy(list.filter(function(interval){
                return interval.value != 'annual' && interval.value != 'quarter';
            }), 'value');
        });
    }

    function getArrayOfSortedSeries() {
        return _.flatten(getArrayOfSeries().reduce(function(blocks, series){
            var block = _.find(blocks, function(block){
                return _.find(block, function(item){
                    return !item.placement ||
                        item.placement == 'with' && item.position == series.id ||
                        series.placement == 'with' && series.position == item.id;
                });
            });
            if (block) {
                block.push(series);
            } else {
                blocks.push([series]);
            }
            return blocks;
        }, []).reduce(function(blocks, block){
            var idx = _.findIndex(blocks, function(b){
                return b.some(function(item){
                    return item.placement == 'below' && _.pluck(block.series, 'id').indexOf(item.position) >= 0;
                }) || block.some(function(item){
                    return item.placement == 'above' && _.pluck(b.series, 'id').indexOf(item.position) >= 0;
                });
            });
            if (idx < 0) {
                blocks.push(block);
            } else {
                blocks.splice(idx, 0, block);
            }
            return blocks;
        }, []).map(function(items, i, blocks){
            return items.map(function(series, j, items){
                if (i === 0 && j === 0) {
                    return _.extend(series, {
                        placement: 'with',
                        position: series.id
                    });
                } else if (j === 0) {
                    return _.extend(series, {
                        placement: 'below',
                        position: blocks[i-1][0].id
                    });
                } else {
                    return _.extend(series, {
                        placement: 'with',
                        position: items[0].id
                    });
                }
            });
        }));
    }

    function getArrayOfSeries() {
        var json = null;
        try {
            json = JSON.parse(screener.getItem("series", '[]'));
        } catch(e) {
            console.log(screener.getItem("series", '[]'));
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

    function mapEachSeries(within, fn) {
        var items = $(within).find('.series');
        return screener.inlineFilters(getArrayOfSeriesInDOM(items)).then(function(items){
            return Promise.all(items.filter(function(series){
                return !series.forIndicator === !series.indicator &&
                    !series.differenceFrom === !series.difference &&
                    !series.percentOf === !series.percent;
            }).map(fn));
        });
    }

    function getArrayOfSeriesInDOM(selector) {
        return $(selector || '.series').toArray().map(function(h6){
            var after = $(h6).closest('.chart').prev('.chart').find('.series').first().data("id");
            var first = $(h6).siblings('.series').first().data("id");
            var before = $(h6).closest('.chart').next('.chart').find('.series').first().data("id");
            var series = $(h6).data();
            return {
                id: series.id,
                forIndicator: series.forIndicator,
                differenceFrom: series.differenceFrom,
                percentOf: series.percentOf,
                lower: series.lower,
                upper: series.upper,
                style: series.style,
                color: series.color,
                className: series.style + " " + series.color + " " + series.id,
                placement: first && first != series.id ? 'with' : after ? 'after' : before ? 'before' : 'with',
                position: first && first != series.id ? first : after ? after : before ? before : series.id
            };
        });
    }

    function drawOhlcChartData(intervals, security, block) {
        var asof = function(datum) {
            return new Date(datum.asof);
        };
        var interval = screener.getItem("security-chart-interval", 'day');
        var width = document.documentElement.clientWidth;
        var height = Math.max(200,Math.min(document.documentElement.clientHeight,800));
        var chart = block.chart;
        var svg = block.svg;
        var within = $(svg).closest('.chart').find('.indicator-list');
        chart.width(width).height(block.unit == 'price' ? height : height/3).xPlot(asof);
        $(window).resize(function(){
            chart.width(document.documentElement.clientWidth);
            d3.select(svg).call(chart);
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
                    loaded.valueOf() + intervals[int].millis < end.valueOf()) {
                var counter = ++redrawCounter;
                drawing = drawing.then(function(){
                    if (counter != redrawCounter) return;
                    var now = Date.now();
                    console.log("Loading", int, begin, end);
                    return loadChartData(chart, security, within, block.unit, intervals, int, begin, end).then(function(){
                        interval = int;
                        var next = _.isEmpty(chart.datum()) ? end.valueOf() :
                            new Date(_.last(chart.datum()).asof).valueOf();
                        loaded = new Date(Math.min(Math.max(end.valueOf() - intervals[int].millis, next), now));
                        if (delay || int == optimalInterval(intervals, int, chart)) {
                            d3.select(svg).call(chart);
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
            chart.x(chart.x().domain([new Date(data[0].asof), new Date()]).range([0,chart.innerWidth()]));
            return loadChartData(chart, security, within, block.unit, intervals, interval, data[0].asof, data[data.length-1].asof);
        }).then(function(){
            return screener.load(security, ['close'], 'day', 1, loaded);
        }).then(function(data){
            chart.rule(data[0].close);
        }).then(function(){
            d3.select(svg).call(chart);
            redraw(false);
        });
        chart.zoomend(redraw.bind(this, false));
        return redraw.bind(this, true);
    }

    function loadChartData(chart, security, within, base_unit, intervals, interval, lower, upper) {
        var earliest = {asof: new Date().toISOString()};
        return promiseData(security, within, intervals, interval, lower, upper).then(function(data){
            if (data.length) earliest.asof = data[0].asof;
            chart.datum(data);
            // zoom out < 1, zoom in > 1
            var ppp = chart.innerWidth()/data.length;
            if (interval.match(/m\d+/)) {
                var m = intervals[interval].millis / 1000 / 60;
                chart.scaleExtent([0.5, Math.max(m/1 /ppp*5,0.5)]);
            } else if (interval == 'month') {
                var out = ppp/5 - 1;
                chart.scaleExtent([Math.min(out>0?1/out/5:1,1), Math.max(5*6.5*60 /ppp*5,1)]);
            } else {
                var out = ppp - 1;
                chart.scaleExtent([Math.min(out>0?1/out/5:1,1), Math.max(6.5*60 /ppp*5,1)]);
            }
        }).then(function(){
            var orphaned = _.keys(chart.series());
            return mapEachSeries(within, function(series){
                var minInterval = getMinInterval(series, intervals[interval]);
                if (minInterval.millis >= intervals[interval].millis && !_.isEmpty(chart.datum()) && !_.isEmpty(_.last(chart.datum())[minInterval.value])) {
                    orphaned.splice(orphaned.indexOf(series.className), 1);
                }
            }).then(function(){
                orphaned.forEach(function(className){
                    chart.series(className, undefined);
                });
            });
        }).then(function(){
            return mapEachSeries(within, function(series){
                var minInterval = getMinInterval(series, intervals[interval]);
                if (minInterval.millis < intervals[interval].millis || _.isEmpty(chart.datum()) || _.isEmpty(_.last(chart.datum())[minInterval.value])) {
                    $('.' + series.id).remove();
                    chart.series(series.className, undefined);
                    return;
                } else {
                    var transform = function(expression) {
                        return function(point) {
                            var value = expression ? valueOf({
                                expression : expression,
                                interval: minInterval
                            }, point) : series.indicator ? valueOf(series.indicator, point) : NaN;
                            var diff = valueOf(series.difference, point);
                            var per = valueOf(series.percent, point) || 100;
                            return (value - diff) *100 / per;
                        };
                    };
                    var primary = transform(series.indicator ? undefined : 'close');
                    if (series.style == 'line') {
                        chart.series(series.className, d3.chart.series.line(primary).xPlot(chart.xPlot()));
                    } else if (series.style == 'bar') {
                        chart.series(series.className, d3.chart.series.bar(primary).xPlot(chart.xPlot()));
                    } else if (series.style == 'band') {
                        var band = function(percent) {
                            return function(point) {
                                var value = valueOf(series.indicator, point);
                                var diff = valueOf(series.difference, point);
                                var per = valueOf(series.percent, point) || 100;
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
                    var unit = getSeriesUnit(series);
                    if (unit == 'percent') {
                        var values = chart.datum().map(primary);
                        var domain = [Math.min(_.min(values), 0), Math.max(_.max(values), 0)];
                        if (unit == 'percent' && domain[0] < 0) {
                            domain[0] = Math.min(domain[0], -100);
                        }
                        if (unit == 'percent' && domain[1] > 0) {
                            domain[1] = Math.max(domain[1], 100);
                        }
                        var y = d3.scale.linear().range(chart.y().range()).domain(domain);
                        if (unit == base_unit) {
                            chart.y(y);
                        } else {
                            chart.series(series.className).y(y);
                        }
                    } else if (unit != 'price') {
                        var values = chart.datum().map(primary);
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
                        if (unit == base_unit) {
                            chart.y(y);
                        } else {
                            chart.series(series.className).y(y);
                        }
                    }
                    if (!_.isEmpty(chart.datum())) {
                        $('#series-' + series.id).find('.value').text(screener.formatNumber(primary(_.last(chart.datum()))));
                    }
                }
            });
        }).then(function(){
            var list = $(within).closest('.indicator-list');
            var sorted = _.sortBy(list.find('.series').toArray(), function(series){
                return parseFloat($(series).find('.value').text() || '0');
            }).reverse();
            $(list).children('a').before(sorted);
        }).then(function(){
            console.log("Loaded", interval, chart.datum().length, chart.datum()[0] && chart.datum()[0].asof);
        }, calli.error);
    }

    function valueOf(indicator, reference) {
        var int = indicator && indicator.interval.value;
        if (!int || !reference[int]) return 0;
        return reference[int][indicator.expression];
    }

    function optimalInterval(intervals, interval, chart) {
        var begin = chart.x().invert(0);
        var end = chart.x().invert(chart.innerWidth());
        var data = chart.datum();
        if (_.isEmpty(data)) return interval;
        var i = Math.max(Math.min(_.sortedIndex(data, {asof: begin.toISOString()}, chart.xPlot()), data.length-10),0);
        var j = Math.max(Math.min(_.sortedIndex(data, {asof: end.toISOString()}, chart.xPlot()), data.length-1),0);
        var size = j - i;
        var x = _.compose(chart.x(), chart.xPlot());
        var width = x(data[j], j) - x(data[i], i);
        var sorted = _.pluck(_.sortBy(_.values(intervals), 'millis'), 'value');
        var intervalMinutes = sorted.map(function(interval){
            if (interval.match(/m\d+/))
                return intervals[interval].millis / 1000 / 60;
            else return intervals[interval].millis / 96000;
        });
        if (!size) return interval;
        var index = sorted.indexOf(interval);
        var minutes = size * intervalMinutes[index];
        var value = Math.round(minutes / width) * 5;
        var i = _.sortedIndex(intervalMinutes, value);
        if (i > 0 && value - intervalMinutes[i-1] < intervalMinutes[i] - value) i--;
        return sorted[Math.min(Math.max(i,0),intervalMinutes.length-1)];
    }

    function promiseData(security, within, intervals, interval, lower, upper) {
        var millis = intervals[interval].millis;
        var min = new Date(upper).valueOf() - millis * 10000;
        var start = new Date(lower).valueOf() < min ? new Date(min) : lower;
        return mapEachSeries(within, function(series){
            if (getMinInterval(series, intervals[interval]).millis < millis) return [];
            return _.compact([
                series.indicator, series.difference, series.percent
            ]).map(function(indicator) {
                return _.object([indicator.interval.value], [[indicator.expression]]);
            });
        }).then(_.flatten).then(function(items){
            return items.reduce(function(hash, item){
                for (var p in item) {
                    hash[p] = (hash[p] ? hash[p] : ['asof']).concat(item[p]);
                }
                return hash;
            }, _.object([interval], [['asof', 'low', 'open', 'close', 'high']]));
        }).then(function(expressionsByInterval){
            var sorted = _.intersection(_.pluck(_.sortBy(_.values(intervals), 'millis'), 'value'), _.keys(expressionsByInterval));
            return Promise.all(sorted.map(function(interval){
                return screener.load(security, expressionsByInterval[interval], interval, 1, start, upper);
            })).then(function(datasets){
                return datasets.map(function(data, i){
                    return data.map(function(datum){
                        return _.extend(_.object([sorted[i]], [datum]), _.pick(datum, 'asof', 'low', 'open', 'close', 'high'));
                    });
                });
            });
        }).then(function(datasets){
            return datasets.reduce(function(merged, data){
                if (_.isEmpty(merged)) return data;
                return merged.map(function(datum){
                    var i = _.sortedIndex(data, datum, 'asof');
                    var j = data[i] && data[i].asof == datum.asof ? i : i-1;
                    return data[j] ? _.extend({}, data[j], datum) : datum;
                });
            }, []);
        });
    }

    function getMinInterval(series, defaultInterval) {
        var intervals = _.pluck(_.compact([
            series.indicator, series.difference, series.percent
        ]), 'interval');
        return _.isEmpty(intervals) ? defaultInterval : _.min(intervals, 'millis');
    }
});