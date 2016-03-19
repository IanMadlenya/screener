// screen.js
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

    initialize();

    function initialize() {
        return initializeProfileState()
            .then(initializeFormActions)
            .then(initializeSecurityClassSelect)
            .then(initializeSinceInput)
            .then(initializeCriteriaSelect)
            .then(initializeCriteriaOptions)
            .then(initializeResultsTable)
            .then(initializeWatchList)
            .then(initializeChartButton)
            .catch(calli.error);
    }

    function initializeProfileState() {
        return screener.getUserProfile().then(function(profile){
            $(document.documentElement).addClass("profile");
            return profile;
        }).catch(function(){
            $(document.documentElement).addClass("no-profile");
        });
    }

    function initializeFormActions() {
        $('#label-dialog').modal({
            show: false,
            backdrop: false
        }).on('shown.bs.modal', function () {
            $('#label').focus();
        });
        $('#store').click(function(event){
            $('#label-dialog').modal('show');
        });
        var comparision = $('#screen-form').attr("resource") && calli.copyResourceData('#screen-form');
        if (window.location.hash.length > 1) {
            $('#label').val(decodeURIComponent(window.location.hash.substring(1)));
        }
        $('#screen-form').submit(function(event){
            event.preventDefault();
            var container = $('#container-resource').attr('resource') || window.location.pathname;
            var creating = event.target.getAttribute("enctype") == "text/turtle";
            var slug = calli.slugify($('#label').val());
            var ns = calli.getFormAction(event.target).replace(/\?.*/,'').replace(/\/?$/, '/');
            var resource = creating ? ns + slug : $(event.target).attr('resource');
            synchronizeCriteria(resource).then(function(){
                var action = calli.getFormAction(event.target);
                if (creating) {
                    event.target.setAttribute("resource", resource);
                    var data = calli.copyResourceData(event.target);
                    return calli.postTurtle(action, data).then(function(redirect){
                        screener.setItem("screen", screener.getItem("screen",'').split(' ').concat(redirect).join(' '));
                        return redirect;
                    });
                } else {
                    var insertData = calli.copyResourceData(event.target);
                    return calli.postUpdate(action, comparision, insertData);
                }
            }).then(function(redirect){
                window.location.replace(redirect);
            }).catch(calli.error);
        });
        var initialLabel = $('#label').val();
        $('#saveas-screen').click(function(event){
            event.preventDefault();
            if (initialLabel == $('#label').val()) {
                $('#label').closest('.form-group').addClass("has-error");
                return;
            }
            var form = $(event.target).closest('form')[0];
            var slug = calli.slugify($('#label').val());
            var type = $('#Screen').attr('href');
            var container = $('#container-resource').attr('resource');
            var resource = container.replace(/\/?$/, '/') + slug;
            form.setAttribute("resource", resource);
            synchronizeCriteria(resource).then(function(){
                return calli.postTurtle(container + "?create=" + encodeURIComponent(type), calli.copyResourceData(form));
            }).then(function(redirect){
                screener.setItem("screen", screener.getItem("screen",'').split(' ').concat(redirect).join(' '));
                window.location.replace(redirect);
            }).catch(calli.error).then(function(){
                $('#label').closest('.form-group').removeClass("has-error");
            });
        });
        $('#cancel-screen').click(function(event){
            window.location.replace('?view');
        });
        $('#delete-screen').click(function(event){
            if (!confirm("Are you sure you want to delete " + document.title + "?"))
                return;
            var action = calli.getFormAction(event.target);
            calli.deleteText(action).then(function(redirect){
                window.location.replace(redirect);
            }).catch(calli.error);
        });
    }

    function synchronizeCriteria(resource) {
        return addMissingCriteriaToDOM(resource + '#').then(function(){
            return prefixCriteria(resource + '#');
        }).then(removeDiscardedCriteria);
    }

    function addMissingCriteriaToDOM(prefix) {
        var now = Date.now();
        var hasCriteria = $('[rel="screener:hasCriteria"]').toArray().map(function(element){
            return element.getAttribute("resource");
        });
        var selectize = $('#criteria')[0].selectize;
        return Promise.all(selectize.items.filter(function(value){
            return hasCriteria.indexOf(value) < 0;
        }).map(function(value){
            return selectize.options[value];
        }).map(function(option, i){
            var iri = prefix + (now + i).toString(36);
            return inlineCriteria(option, iri).then(function(node){
                selectize.updateOption(option.value, _.extend({}, option, {
                    iri: iri,
                    value: iri
                }));
                return iri;
            });
        })).then(function(result){
            selectize.refreshItems();
            return result;
        });
    }

    function prefixCriteria(prefix) {
        var selectize = $('#criteria')[0].selectize;
        var result = selectize.items.filter(function(value){
            return value.indexOf(prefix) !== 0;
        }).map(function(value){
            var iri = prefix + value.replace(/.*#/,'');
            $('[rel="screener:hasCriteria"][resource="' + value + '"]').attr("resource", iri);
            selectize.updateOption(value, _.extend({}, selectize.options[value], {
                iri: iri,
                value: iri
            }));
            return iri;
        });
        selectize.refreshItems();
        return result;
    }

    function removeDiscardedCriteria() {
        var selectize = $('#criteria')[0].selectize;
        var discarded = $('[rel="screener:hasCriteria"]').filter(function(){
            return selectize.items.indexOf(this.getAttribute("resource")) < 0;
        }).remove();
    }

    function inlineCriteria(option, iri) {
        var resource = iri || '#' + Date.now().toString(36);
        return calli.addResource(event, '#criteria-container').then(function(node){
            node.setAttribute("resource", resource);
            $(node).find('.label-input').val(option.text).change();
            var regex = /^([a-zA-Z0-9\+\-\.]+:\/\/[a-zA-Z0-9\-\._~%!\$\&'\(\)\*\+,;=:\/\[\]]+)(?: ([<=>])=? ([0-9\.eE+\-]+|[a-zA-Z0-9\+\-\.]+:\/\/[a-zA-Z0-9\-\._~%!\$\&'\(\)\*\+,;=:\/\[\]]+))?$/;
            var m = option.value.match(regex);
            if (m) {
                $(node).find('.forIndicator').append($('<option></option>', {
                    selected: "selected",
                    value: m[1]
                })).change();
                if (m[3] && m[3].indexOf('://') > 0) $(node).find('.differenceFrom').append($('<option></option>', {
                    selected: "selected",
                    value: m[3]
                })).change();
                var bound = _.isFinite(m[3]) ? +m[3] : 0;
                if (m[2] == '>' || m[2] == '=') $(node).find('.lower').val(bound).change();
                if (m[2] == '<' || m[2] == '=') $(node).find('.upper').val(bound).change();
            }
            return node;
        });
    }

    function initializeSecurityClassSelect() {
        return screener.listSecurityClasses().then(function(classes){
            return Promise.all(($('#forSecurity').val() || []).filter(function(iri){
                return iri && iri.indexOf('://') > 0 && _.pluck(classes, 'iri').indexOf(iri) < 0;
            }).map(screener.getSecurity.bind(screener))).then(function(securities){
                return _.union(securities.map(function(security){
                    return {
                        text: security.ticker,
                        value: security.iri,
                        title: security.name,
                        mic: security.exchange.mic
                    };
                }), classes.map(function(cls){
                    return {
                        value: cls.iri,
                        text: cls.label
                    };
                }));
            });
        }).then(function(options){
            return {
                options: options,
                items: $('#forSecurity').val(),
                closeAfterSelect: true,
                load: function(query, callback) {
                    if (!query) callback();
                    return screener.lookup(query).then(function(securities){
                        return securities.map(function(security){
                            return {
                                text: security.ticker,
                                value: security.iri,
                                title: security.name,
                                mic: security.exchange.mic
                            };
                        });
                    }).then(callback, function(error){
                        callback();
                        calli.error(error);
                    });
                },
                render: {
                    option: function(data, escape) {
                        return '<div style="white-space:nowrap;text-overflow:ellipsis;" title="' +  escape(data.title || '') + '">' +
                            (data.title ?
                                (
                                    '<b>' + escape(data.text) + "</b> | " + escape(data.title) +
                                    ' <small class="text-muted">(' + escape(data.mic) + ')</small>'
                                ) :
                               escape(data.text)
                            ) +
                        '</div>';
                    },
                    item: function(data, escape) {
                        var target = $('#screen-form').closest('form').length ? "_blank" : "_self";
                        return '<div class="" title="' + escape(data.title || '') +
                            '"><a href="' + escape(data.value) + '" target="' + target + '">' + escape(data.text) + '</a></div>';
                    }
                }
            };
        }).then(function(selectize){
            return screener.getUserProfile().then(function(profile){
                return _.extend(selectize, {
                    create: function(input, callback) {
                        var cls = $('#SecurityClass').prop('href');
                        var url = profile + "?create=" + encodeURIComponent(cls) + "#" + encodeURIComponent(input);
                        calli.createResource('#forSecurity', url).then(function(iri){
                            callback({
                                value: iri,
                                text: input
                            });
                        }, function(error){
                            callback();
                            call.error(error);
                        });
                    }
                });
            }, function(){
                // Security Class create is disabled
                return selectize; // no profile
            });
        }).then(function(selectize){
            return $('#forSecurity').selectize(selectize).change();
        });
    }

    function initializeSinceInput() {
        var changing = false;
        $('#lookback').val($('#lookback').val() || 20).change(function(event){
            if (changing) return;
            screener.promiseWorkday(-event.target.value).then(function(date){
                $('#since').prop('valueAsDate', date);
            });
        }).change();
        $('#since').change(function(event){
            var since = event.target.valueAsDate;
            since.setMinutes(since.getMinutes() + since.getTimezoneOffset());
            var today = new Date(screener.now().toISOString().replace(/T.*/,''));
            today.setMinutes(today.getMinutes() + today.getTimezoneOffset());
            if (today.getDay() === 0) {
                today.setDate(today.getDate() - 1);
            }
            var days = (today.valueOf() - since.valueOf()) / 1000 / 60 / 60 / 24;
            var weeks = Math.floor(days / 7);
            var lookback = Math.round(Math.min(days - weeks * 7, 4) + weeks * 5);
            try {
                changing = true;
                $('#lookback').val(lookback).change();
            } finally {
                changing = false;
            }
        });
    }

    function initializeCriteriaSelect() {
        return screener.listUnits().then(function(units){
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
                            forIndicator: i.iri,
                            unit: i.unit,
                            optgroup: i.interval.label + ' ' + i.unit.label,
                            optorder: (units.indexOf(i.unit.label) + intervals.indexOf(i.interval.label) * units.length) + zero,
                            title: i.comment
                        };
                    });
                });
            });
        }).then(function(options){
            return _.sortBy(_.sortBy(options, 'text'), 'optorder');
        }).then(function(options){
            var list = $('[rel="screener:hasCriteria"]').toArray().filter(function(node){
                return node.getAttribute("resource").charAt(0) != '?'; // template variable in new profile page
            }).map(readCriteria);
            return screener.inlineFilters(list).then(function(list){
                return list.map(criteriaAsOption);
            }).then(function(items){
                return items.concat(options);
            });
        }).then(function(options){
            window.onCriteriaOpen = function(value){
                openCriteriaModal(value);
                return false;
            };
            var lastItemAdded;
            return {
                searchField: ['text', 'title', 'expression'],
                sortField: [{field:'optorder'}, {field:'$score'}, {field:'text'}],
                options: options,
                items: $('[rel="screener:hasCriteria"]').toArray().map(readCriteria).map(_.property('iri')),
                optgroups: _.uniq(_.pluck(options, 'optgroup')).map(function(optgroup){
                    return {
                        value: optgroup,
                        label: optgroup
                    };
                }),
                render: {
                    item: function(data, escape){
                        return '<div title="' + escape(data.title || '') + '"><a href="' + escape(data.value) +
                            '" onclick="return onCriteriaOpen(\'' + escape(data.value.replace("'", '')) + '\')">' +
                            escape(data.text) + '</a></div>';
                    }
                },
                load: function(query, callback) {
                    var search = this.search.bind(this);
                    var options = this.options;
                    var value = lastItemAdded && this.getValue().indexOf(lastItemAdded) >= 0 ? lastItemAdded : _.last(this.getValue());
                    Promise.resolve(query || '').then(function(query){
                        var m = query.match(/\s*(([<=>])=?\s*)([^<=>]+)$/);
                        if (!m || !value || !options[value].unit) return;
                        var option = options[value];
                        var operation = m[1];
                        var op = m[2];
                        var parameter = m[3];
                        if (_.isFinite(parameter)) return [{
                            replaces: option.value,
                            value: option.value + ' ' + op + '= ' + parameter,
                            text: option.text +' ' + operation + parameter,
                            forIndicator: option.forIndicator || option.value,
                            lower: op == '=' || op == '>' ? +parameter : option.lower,
                            upper: op == '=' || op == '<' ? +parameter : option.upper,
                            optgroup: $('[for="criteria"]').text(),
                            optorder: 0
                        }]; else if (parameter) return _.compact(search(parameter).items.map(function(item){
                            if (!options[item.id].unit) return;
                            else return {
                                replaces: option.value,
                                value: option.value + ' ' + op + '= ' + item.id,
                                text: option.text +' ' + operation + options[item.id].text,
                                expression: options[item.id].expression,
                                forIndicator: option.forIndicator || option.value,
                                differenceFrom: item.id,
                                lower: op == '=' || op == '>' ? 0 : option.lower,
                                upper: op == '=' || op == '<' ? 0 : option.upper,
                                optgroup: $('[for="criteria"]').text(),
                                optorder: 0
                            };
                        }));
                    }).then(function(data){
                        callback(data);
                    }, function(){
                        callback();
                    });
                },
                onItemAdd: function(value, $item) {
                    lastItemAdded = value;
                    var selectize = this;
                    var option = selectize.options[value];
                    if (option.replaces) {
                        selectize.removeItem(option.replaces);
                    }
                    if (value.indexOf(' ') > 0) {
                        inlineCriteria(option).then(readCriteria).then(function(criteria){
                            return screener.inlineFilters([criteria]).then(_.first);
                        }).then(criteriaAsOption).then(function(option){
                            selectize.updateOption(value, option);
                            selectize.refreshItems();
                        });
                    }
                },
                onDropdownClose: function() {
                    var selectize = this;
                    _.filter(selectize.options, function(option){
                        return option.replaces;
                    }).forEach(function(option){
                        selectize.removeOption(option.value);
                    });
                }
            };
        }).then(function(selectize){
            $('#criteria').selectize(selectize).change();
        });
    }

    function openCriteriaModal(value){
        var selectize = $('#criteria')[0].selectize;
        return Promise.resolve(value).then(function(value){
            var option = selectize.options[value];
            var node = $('[rel="screener:hasCriteria"][resource="' + value + '"]');
            return node.length ? node[0] : inlineCriteria(option);
        }).then(initializeIndicatorElements)
          .then(initializeWatchIndicatorState)
          .then(function(node){
            return screener.inlineFilters([readCriteria(node)]).then(_.first).then(criteriaAsOption).then(function(option){
                if (value == option.value) {
                    selectize.updateOption(value, option);
                } else {
                    selectize.addOption(option);
                    selectize.addItem(option.value);
                    selectize.removeItem(value);
                }
                return node;
            });
          }).then(function(node){
            $(node).modal({
                backdrop: false
            }).one('hide.bs.modal', function(event){
                screener.inlineFilters([readCriteria(node)]).then(_.first).then(criteriaAsOption).then(function(option){
                    selectize.updateOption(option.value, option);
                    selectize.refreshItems();
                });
            });
        }).catch(calli.error);
    }

    function initializeIndicatorElements(node) {
        return screener.listUnits().then(function(units){
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
                            unit: i.unit,
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
            $(node).find('select[name="indicator"]').selectize({
                searchField: ['text', 'title', 'expression'],
                sortField: [{field:'optorder'}, {field:'$score'}, {field:'text'}],
                options: items,
                optgroups: _.uniq(_.pluck(items, 'optgroup')).map(function(optgroup){
                    return {
                        value: optgroup,
                        label: optgroup
                    };
                }),
                render: {
                    item: function(data, escape) {
                        return '<div title="' + escape(data.title || '') + '">' + escape(data.text) + '</div>';
                    }
                }
            }).change();
            return node;
        });
    }

    function initializeWatchIndicatorState(node) {
        var holdCriteria = !$(node).find('[rel="screener:forWatchIndicator"]').attr("resource");
        $(node).find('.holdCriteria').prop("checked", holdCriteria).change();
        var holdReference = $(node).find('[rel="screener:differenceFrom"]').attr("resource") ||
            $(node).find('[rel="screener:percentOf"]').attr("resource") || holdCriteria &&
            !$(node).find('[rel="screener:differenceFromWatch"]').attr("resource") &&
            !$(node).find('[rel="screener:percentOfWatch"]').attr("resource");
        $(node).find('.holdReference').prop("checked", holdReference).change();
        return node;
    }

    function initializeCriteriaOptions() {
        $('[property="screener:againstCorrelated"]').toArray().forEach(function(prop){
            var node = $(prop).closest('[resource]');
            var checked = $(prop).attr("content") == "true";
            $(node).find('.againstCorrelated').prop("checked", checked).change();
        });
        $('#criteria-container').on('change', '.againstCorrelated', function(event){
            var node = $(event.target).closest('[resource]');
            var againstCorrelated = $(node).find('[property="screener:againstCorrelated"]');
            if (!againstCorrelated.length) {
                againstCorrelated = $('<span></span>', {
                    property: "screener:againstCorrelated",
                    datatype: "xsd:boolean"
                }).insertBefore(this);
            }
            againstCorrelated.attr("content", this.checked);
        }).on('change', '.holdCriteria', function(event){
            var node = $(event.target).closest('[resource]');
            if (this.checked) {
                toggleSelect(node, '.forWatchIndicator', '.forIndicator');
            } else {
                toggleSelect(node, '.forIndicator', '.forWatchIndicator');
            }
        }).on('change', '.holdReference', function(event){
            var node = $(event.target).closest('[resource]');
            if (this.checked) {
                toggleSelect(node, '.differenceFromWatch', '.differenceFrom');
                toggleSelect(node, '.percentOfWatch', '.percentOf');
            } else {
                toggleSelect(node, '.differenceFrom', '.differenceFromWatch');
                toggleSelect(node, '.percentOf', '.percentOfWatch');
            }
        });
    }

    function toggleSelect(node, disable, enable) {
        $(node).find(disable).closest('.form-group').addClass("hidden");
        $(node).find(enable).closest('.form-group').removeClass("hidden");
        if ($(node).find(disable)[0].selectize && $(node).find(disable).val()) {
            $(node).find(enable)[0].selectize.setValue($(node).find(enable).val() || $(node).find(disable).val());
            $(node).find(disable)[0].selectize.clear();
        }
    }

    function readCriteria(node) {
        return {
            iri: $(node).attr("resource"),
            label: $(node).find('[property="rdfs:label"]').attr("content"),
            comment: $(node).find('[property="rdfs:comment"]').attr("content"),
            forIndicator: $(node).find('[rel="screener:forIndicator"]').attr("resource"),
            differenceFrom: $(node).find('[rel="screener:differenceFrom"]').attr("resource"),
            percentOf: $(node).find('[rel="screener:percentOf"]').attr("resource"),
            forWatchIndicator: $(node).find('[rel="screener:forWatchIndicator"]').attr("resource"),
            differenceFromWatch: $(node).find('[rel="screener:differenceFromWatch"]').attr("resource"),
            percentOfWatch: $(node).find('[rel="screener:percentOfWatch"]').attr("resource"),
            againstCorrelated: $(node).find('[property="screener:againstCorrelated"]').attr("content") == "true",
            lower: $(node).find('[property="screener:lower"]').attr("content"),
            upper: $(node).find('[property="screener:upper"]').attr("content"),
            gainIntercept: $(node).find('[property="screener:gainIntercept"]').attr("content"),
            gainSlope: $(node).find('[property="screener:gainSlope"]').attr("content"),
            painIntercept: $(node).find('[property="screener:painIntercept"]').attr("content"),
            painSlope: $(node).find('[property="screener:painSlope"]').attr("content"),
            weight: $(node).find('[property="screener:weight"]').attr("content")
        };
    }

    function criteriaAsOption(criteria) {
        return _.extend({
            value: criteria.iri,
            text: criteria.label,
            title: criteria.comment,
            optgroup: $('[for="criteria"]').text(),
            optorder: 0
        }, criteria);
    }

    function initializeResultsTable() {
        $('#show-results-table').click(function(event){
            $('#results-table').parent().collapse('toggle');
        });
        $('#results-table').parent().on('show.bs.collapse', function(){
            $('#show-results-table').children('.glyphicon').removeClass('glyphicon-expand').addClass('glyphicon-collapse-down');
        }).on('hidden.bs.collapse', function(){
            $('#show-results-table').children('.glyphicon').removeClass('glyphicon-collapse-down').addClass('glyphicon-expand');
        });
    }

    function initializeWatchList() {
        var fn = updateWatchList.bind(this, {});
        var promise = fn();
        var loading = 0;
        var debounce = screener.debouncePromise(fn, 2000, promise);
        $('form').change(function() {
            var counter = ++loading;
            $('.table').addClass("loading");
            return debounce.apply(this, arguments).then(function(resolved) {
                if (counter == loading) {
                    $('.table').removeClass("loading");
                }
                return resolved;
            }, function(error) {
                if (counter == loading) {
                    $('.table').removeClass("loading");
                }
                return Promise.reject(error);
            });
        });
        return promise;
    }

    function updateWatchList(cache) {
        if (isScreenIncomplete())
            return Promise.resolve();
        $('.table').addClass("loading");
        return promiseFilters().then(function(filters) {
            return promiseSince().then(function(since){
                var securities = $('[rel="screener:forSecurity"]').toArray().map(function(element){
                    return element.getAttribute("resource");
                });
                var now = screener.now();
                return Promise.resolve(JSON.stringify([securities, filters.map(function(criteria){
                    return _.omit(criteria, 'label');
                }), since])).then(function(key){
                    if (cache[key]) {
                        cache[key].promise = cache[key].promise.catch(function(){
                            return screener.screen(securities, filters, since, now);
                        });
                    } else {
                        cache[key] = {
                            asof: new Date(),
                            promise: screener.screen(securities, filters, since, now)
                        };
                    }
                    return cache[key].promise;
                }).then(updatePerformance.bind(this, since, now));
            });
        }).then(function(list){
            if (_.some(_.pluck(list, 'watch'), 'gain')) {
                $('#results-table').removeClass("no-estimate");
            } else {
                $('#results-table').addClass("no-estimate");
            }
            return _.groupBy(list, 'security');
        }).then(function(occurrences){
            var target = $('#screen-form').length ? "_blank" : "_self";
            var securities = _.keys(occurrences).sort();
            var rows = securities.map(function(security){
                // ticker
                var last = _.last(occurrences[security]);
                var stopped = last.stop ? "text-muted" : "";
                var incomplete = last.watch.incomplete || last.stop && last.stop.incomplete ? "incomplete" : "";
                return $('<tr></tr>', {
                    resource: security,
                    "class": stopped + " " + incomplete
                }).append($('<td></td>').append($('<a></a>', {
                    href: security,
                    target: target
                }).text(decodeURIComponent(security.replace(/^.*\//,'')))));
            });
            $('#results-table tbody').empty().append(rows);
            $('.table').removeClass("loading");
            return Promise.all(securities.map(function(security, i){
                var tr = rows[i];
                var list = occurrences[security];
                return screener.getSecurity(security).then(function(result){
                    return tr.append($('<td></td>', {
                        "class": "text-ellipsis",
                        title: result ? result.name : ''
                    }).text(result ? result.name : ''));
                }).then(function(){
                    var datum = _.last(list);
                    var hold = (datum.stop || datum.hold || datum.watch);
                    tr.append($('<td></td>', {
                        "class": "text-right",
                        title: new Date(hold.lastTrade || hold.asof).toLocaleString(),
                        "data-value": hold.price
                    }).text('$' + hold.price.toFixed(2)));
                    var positive = datum.stop ? "text-muted" : "text-success";
                    var negative = datum.stop ? "text-muted" : "text-danger";
                    var change = hold.price - datum.watch.price;
                    tr.append($('<td></td>', {
                        "class": "text-right " + (change < 0 ? negative : positive),
                        "data-value": change
                    }).text('$' + change.toFixed(2)));
                    tr.append(percentCell(hold.gain).addClass("estimate " + positive));
                    tr.append(percentCell(hold.pain).addClass("estimate " + negative));
                    tr.append(decimalCell(hold.gain / Math.abs(hold.pain)).addClass("estimate"));
                    var positive_excursion = avg_annual_positive_excursion(list);
                    var negative_excursion = avg_annual_negative_excursion(list);
                    tr.append(percentCell(positive_excursion).addClass(positive));
                    tr.append(percentCell(negative_excursion).addClass(negative));
                    var wins = list.reduce(function(gain, datum){
                        return datum.performance > 0 ? datum.performance + gain : gain;
                    }, 0);
                    var losses = list.reduce(function(pain, datum){
                        return datum.performance < 0 ? datum.performance + pain : pain;
                    }, 0);
                    var factor = wins && losses ? wins / Math.abs(losses) :
                        positive_excursion / Math.abs(negative_excursion);
                    tr.append(decimalCell(factor));
                    var performance = list.reduce(function(profit, datum){
                        return profit + profit * datum.performance / 100;
                    }, 1) * 100 - 100;
                    tr.append(percentCell(performance).attr("data-value", performance));
                    var exposed = sum(_.pluck(list, 'exposure')) /100;
                    tr.append($('<td></td>', {
                        "class": "text-right",
                        "data-value": exposed
                    }).text(formatDuration(exposed)));
                });
            }));
        }).then(function(){
            screener.sortTable('#results-table');
        }).catch(calli.error);
    }

    function percentCell(value) {
        if (_.isFinite(value)) return $('<td></td>', {
            "class": "text-right"
        }).text(value.toFixed(2) + '%');
        else return $('<td></td>');
    }

    function decimalCell(value) {
        if (_.isFinite(value)) return $('<td></td>', {
            "class": "text-right",
            "data-value": value
        }).text(value.toFixed(2));
        else return $('<td></td>');
    }

    function isScreenIncomplete() {
        if (!$('[rel="screener:forSecurity"]').toArray().find(function(element){
            return element.getAttribute("resource");
        })) return true;
        else if (!$('[rel="screener:hasCriteria"]').length)
            return true;
        else if (!$('#criteria').length)
            return false;
        else if (_.isEmpty($('#criteria').val()))
            return true;
        return !!getFilters().find(function(criteria) {
            return !criteria.indicator && !criteria.forIndicator &&
                !criteria.forWatchIndicator && !criteria.indicatorWatch;
        });
    }

    function getFilters() {
        var list = $('[rel="screener:hasCriteria"]').toArray().map(readCriteria);
        if (!$('#criteria').length) return list;
        var selectize = $('#criteria')[0].selectize;
        var filters = _.indexBy(list, 'iri');
        return selectize.items.map(function(value){
            return filters[value] || selectize.options[value];
        });
    }

    function promiseFilters() {
        var list = $('[rel="screener:hasCriteria"]').toArray().map(readCriteria);
        return screener.inlineFilters(list).then(function(list){
            if (!$('#criteria').length) return list;
            var selectize = $('#criteria')[0].selectize;
            var filters = _.indexBy(list, 'iri');
            return selectize.items.map(function(value){
                return filters[value] || selectize.options[value];
            });
        });
    }

    function updatePerformance(begin, end, list) {
        var occurances = list.length;
        var bysec = _.groupBy(list, 'security');
        var performance = sum(_.map(bysec, function(list, security){
            return list.reduce(function(profit, datum){
                return profit + profit * datum.performance / 100;
            }, 1) * 100 - 100;
        })) / _.size(bysec) || 0;
        var avg = sum(_.pluck(list, 'performance')) / occurances || 0;
        var sd = Math.sqrt(sum(_.flatten(list.map(function(datum){
            var diff = datum.performance - avg;
            return diff * diff;
        }))) / Math.max(occurances-1,1));
        var winners = _.pluck(list, 'performance').filter(function(num){
            return num > 0;
        });
        var loosers = _.pluck(list, 'performance').filter(function(num){
            return num < 0;
        });
        var runup = sum(_.map(bysec, avg_annual_positive_excursion)) / _.size(bysec);
        var drawdown = sum(_.map(bysec, avg_annual_negative_excursion)) / _.size(bysec);
        var exposure = sum(_.pluck(list, 'exposure'));
        var yearLength = 365 * 24 * 60 *60 * 1000;
        var duration = (new Date(end).valueOf() - new Date(begin).valueOf()) / yearLength;
        var growth = cagr(performance, duration);
        var exposed_growth = cagr(performance, sum(_.pluck(list, 'exposure')) /100 / _.size(bysec));
        var avg_duration = sum(_.pluck(list, 'exposure')) /100 / occurances || 0;
        $('#security_count').text(_.size(bysec));
        $('#occurances').text(occurances);
        $('#average_duration').text(formatDuration(avg_duration));
        $('#standard_deviation').text('±' + sd.toFixed(2) + '%');
        $('#average_performance').text(avg.toFixed(2) + '%');
        $('#percent_positive').text((winners.length / occurances * 100 || 0).toFixed(0) + '%');
        $('#positive_excursion').text(_.isFinite(runup) ? runup.toFixed(2) + '%' : '');
        $('#negative_excursion').text(_.isFinite(drawdown) ? drawdown.toFixed(2) + '%' : '');
        $('#performance_factor').text(loosers.length ? (sum(winners) / -sum(loosers)).toFixed(1) : '');
        $('#performance').text(performance.toFixed(2) + '%');
        $('#annual_growth').text(Math.abs(growth) < 10 ? (growth * 100).toFixed(2) + '%' : '');
        $('#exposed_growth').text(Math.abs(exposed_growth) < 10 ? (exposed_growth * 100).toFixed(2) + '%' : '');
        return list;
    }

    function avg_annual_positive_excursion(list) {
        var positive_excursions = list.reduce(function(runup, datum){
            var year = datum.watch.asof.substring(0, 4);
            runup[year] = Math.max(datum.positive_excursion, runup[year] || 0);
            return runup;
        }, {});
        return sum(positive_excursions)/_.size(positive_excursions);
    }

    function avg_annual_negative_excursion(list) {
        var negative_excursions = list.reduce(function(drawdown, datum){
            var year = datum.watch.asof.substring(0, 4);
            drawdown[year] = Math.min(datum.negative_excursion, drawdown[year] || 0);
            return drawdown;
        }, {});
        return sum(negative_excursions)/_.size(negative_excursions);
    }

    function cagr(rate, years) {
        if (!years) return 0;
        if (rate < 0) return -1 * cagr(Math.abs(rate), years);
        else return Math.pow(1 + rate / 100, 1 / years) - 1;
    }

    function sum(numbers) {
        return _.reduce(numbers, function(sum, num){
            return sum + num;
        }, 0);
    }

    function formatDuration(years) {
        if (!years) {
            return '';
        } else if (years *52 > 1.5) {
            return(years *52).toFixed(0) + 'w';
        } else if (years *260 > 1.5) {
            return(years *260).toFixed(0) + 'd';
        } else if (years *260*6.5 > 1.5) {
            return(years *260*6.5).toFixed(0) + 'h';
        } else if (years *260*6.5*60 > 1.5) {
            return(years *260*6.5*60).toFixed(0) + 'm';
        } else if (years *260*6.5*60*60 > 1.5) {
            return(years *260*6.5*60*60).toFixed(0) + 's';
        } else {
            return(years *260*6.5*60*60).toFixed(3) + 's';
        }
    }

    function initializeChartButton() {
        var cache = {}, y;
        $('#criteria-container').on('click', '.chart-btn', function(event){
            var btn = $(event.target).find('.glyphicon');
            btn.toggleClass('glyphicon-expand glyphicon-collapse-down');
            var node = $(event.target).closest('[resource]');
            if (btn.is('.glyphicon-collapse-down') && isScreenIncomplete()) {
                btn.toggleClass('glyphicon-expand glyphicon-collapse-down');
            } else if (btn.is('.glyphicon-expand')) {
                $(node).find('.charts').empty();
                y = undefined;
            }
        }).on('click change', screener.debouncePromise(function(event){
            var node = $(event.target).closest('[resource]');
            var btn = $(node).find('.chart-btn');
            if (btn.find('.glyphicon').is('.glyphicon-expand')) return;
            return promiseSignals(cache, true).then(analyzeSignals.bind(this, node)).then(sortResults).then(combineResults).then(function(data){
                if (_.isEmpty(data)) return;
                var container = $(node).find('.charts')[0];
                var criteria = readCriteria(node);
                var lower = _.isFinite(criteria.lower) ? criteria.lower : _.first(data).value;
                var upper = _.isFinite(criteria.upper) ? criteria.upper : _.last(data).value;
                var width = $(container).width();
                var clientHeight = document.documentElement.clientHeight - 50; // iframe border
                var height = Math.max(200,Math.min(Math.max(clientHeight/3, clientHeight - $(container).offset().top),800));
                var innerWidth = width -70;
                var innerHeight = height -50;
                var x = d3.scale.linear().range([0, innerWidth]).domain([lower, upper]);
                if (!y || _.first(y.range()) != innerHeight) {
                    y = d3.scale.linear().range([innerHeight, 0]).domain([_.first(data).excursion[0], _.first(data).excursion[3]]);
                }
                y.domain([
                    Math.min(_.min(data, _.compose(_.first, _.property('excursion'))).excursion[0], _.first(y.domain())),
                    Math.max(_.max(data, _.compose(_.last, _.property('excursion'))).excursion[3], _.last(y.domain()))
                ]);
                var svg = updateAll(d3.select(container), "svg", "chart").attr("width", width).attr("height", height);
                var g = updateAll(svg, "g", "grid").attr("transform", "translate(50,20)");
                chartData(g, data, x, y);
                var painIntercept = $(node).find('.painIntercept').val();
                var painSlope = $(node).find('.painSlope').val();
                var gainIntercept = $(node).find('.gainIntercept').val();
                var gainSlope = $(node).find('.gainSlope').val();
                var x1 = _.first(x.domain());
                var x2 = _.last(x.domain());
                if (_.isFinite(painIntercept) && _.isFinite(painSlope)) {
                    updateAll(g, "line", "pain line")
                        .attr("x1", x(x1)).attr("y1", y(x1 * painSlope + +painIntercept))
                        .attr("x2", x(x2)).attr("y2", y(x2 * painSlope + +painIntercept));
                }
                if (_.isFinite(gainIntercept) && _.isFinite(gainSlope)) {
                    updateAll(g, "line", "gain line")
                        .attr("x1", x(x1)).attr("y1", y(x1 * gainSlope + +gainIntercept))
                        .attr("x2", x(x2)).attr("y2", y(x2 * gainSlope + +gainIntercept));
                }
            }).catch(calli.error).then(loading(btn));
        }, 100)).on('click', '.regression-btn', screener.debouncePromise(function(event){
            var node = $(event.target).closest('[resource]');
            return promiseSignals(cache).then(analyzeSignals.bind(this, node)).then(function(signals){
                var data = sortResults(signals);
                if (_.isEmpty(data)) return;
                var negative = regression(1, data);
                var positive = regression(2, data);
                var weight = getCriteriaWeight(node, negative, positive, signals);
                $(node).find('.weight').val(weight).change();
                $(node).find('.painIntercept').val(negative[0]).change();
                $(node).find('.painSlope').val(negative[1]).change();
                $(node).find('.gainIntercept').val(positive[0]).change();
                $(node).find('.gainSlope').val(positive[1]).change();
            }).catch(calli.error).then(loading(event.target));
        }, 100)).on('show.bs.modal', function(event){
            var estimatedPeriod = $('[property="screener:estimatedPeriod"]');
            var period = estimatedPeriod.attr("content") || "P1D";
            var m = period.match(/PT?(\d+)([DH])/);
            var value = m[1];
            var unit = m[2];
            var input = $(event.target).closest('[resource]').find('input.period');
            input.closest('.form-group').find('.input-group-addon').text(unit);
            input.val(value).on('change', periodChanged).change();
        }).on('hide.bs.modal', function(event){
            var node = $(event.target).closest('[resource]');
            var btn = $(node).find('.chart-btn .glyphicon-collapse-down');
            btn.toggleClass('glyphicon-expand glyphicon-collapse-down');
            $(node).find('.charts').empty();
            $(node).find('input.period').off('change', periodChanged);
            y = undefined;
        });
    }

    function periodChanged(event) {
        var node = $(event.target).closest('[resource]');
        var value = +(event.target.value || 1);
        var unit = $(event.target).closest('.form-group').find('.input-group-addon').text();
        if (unit.indexOf('D') >= 0 && value < 0) {
            event.target.value = 24 + value;
            $(event.target).closest('.form-group').find('.input-group-addon').text('H');
            $(event.target).change();
        } else if (unit.indexOf('H') >= 0 && value > 24) {
            event.target.value = value - 24;
            $(event.target).closest('.form-group').find('.input-group-addon').text('D');
            $(event.target).change();
        } else if (value < 0) {
            event.target.value = 0;
            $(event.target).closest('.form-group').find('.input-group-addon').text('H');
            $(event.target).change();
        } else {
            var estimatedPeriod = $('[property="screener:estimatedPeriod"]');
            if (!estimatedPeriod.length) estimatedPeriod = $('<div></div>', {
                property: "screener:estimatedPeriod",
                datatype: "xsd:dayTimeDuration"
            }).appendTo($(event.target).closest('form'));
            var day = unit.indexOf('D') >= 0;
            var period = day ? 'P' + value + 'D' : 'PT' + value + 'H';
            estimatedPeriod.attr("content", period);
        }
    }

    function loading(button) {
        var loading = window.setTimeout(function(){
            $(button).button('loading');
        }, 1000);
        return function() {
            window.clearTimeout(loading);
            $(button).button('reset');
        };
    }

    function getCriteriaWeight(node, negative, positive, signals) {
        var criteria = readCriteria(node);
        var variance = varianceOf(node, negative, positive, signals);
        var weights = _.range(0, 11).reduce(function(weights, t){
            weights[t * 10] = Math.round(variance(t * 10));
            return weights;
        }, []);
        var minimum = _.min(weights);
        if (weights[50] == minimum) return 50;
        var i = weights.indexOf(minimum);
        var j = weights.lastIndexOf(minimum);
        if (j - i < 2) return Math.round((i + j) / 2);
        _.range(Math.max(i-10, 0), Math.min(j+11, 101)).forEach(function(w){
            weights[w] = variance(w);
        });
        var min = _.min(weights);
        return Math.floor((weights.indexOf(min) + weights.lastIndexOf(min)) / 2);
    }

    function varianceOf(node, negative, positive, signals) {
        var painIntercept = +($(node).find('.painIntercept').val() || 0);
        var painSlope = +($(node).find('.painSlope').val() || 0);
        var gainIntercept = +($(node).find('.gainIntercept').val() || 0);
        var gainSlope = +($(node).find('.gainSlope').val() || 0);
        var weight = +(_.isFinite($(node).find('.painIntercept').val()) &&
            _.isFinite($(node).find('.gainIntercept').val()) &&
            $(node).find('.weight').val() || 0);
        var totalWeight = getFilters().reduce(function(total, criteria){
            if (!_.isFinite(criteria.gainIntercept) || !_.isFinite(criteria.painIntercept))
                return total;
            else return +criteria.weight + total;
        }, 0);
        return function(adjustedWeight) {
            var adjustedTotal = totalWeight - weight + adjustedWeight;
            return signals.reduce(function(s, datum){
                if (!datum) return s;
                else if (!adjustedTotal) return s +
                    datum.excursion[1] * datum.excursion[1] +
                    datum.excursion[2] * datum.excursion[2];
                var oldPain = (+painIntercept + datum.value * painSlope) * weight;
                var oldGain = (+gainIntercept + datum.value * gainSlope) * weight;
                var newPain = (+negative[0] + datum.value * negative[1]) * adjustedWeight;
                var newGain = (+positive[0] + datum.value * positive[1]) * adjustedWeight;
                var pain = ((datum.pain || 0) * totalWeight - oldPain + newPain) / adjustedTotal;
                var gain = ((datum.gain || 0) * totalWeight - oldGain + newGain) / adjustedTotal;
                return s + (pain - datum.excursion[1]) * (pain - datum.excursion[1]) +
                    (gain - datum.excursion[2]) * (gain - datum.excursion[2]);
            }, 0);
        };
    }

    function chartData(svg, data, x, y){
        var innerWidth = _.last(x.range()) - _.first(x.range());
        var innerHeight = _.first(y.range()) - _.last(y.range());
        var neg = updateAll(svg, "path", "negative area").datum(data).attr("d", d3.svg.area().x(function(d){
            return x(d.value);
        }).y0(function(d){
            return y(d.excursion[0]);
        }).y1(function(d){
            return y(d.excursion[2]);
        }));
        var pos = updateAll(svg, "path", "positive area").datum(data).attr("d", d3.svg.area().x(function(d){
            return x(d.value);
        }).y0(function(d){
            return y(d.excursion[1]);
        }).y1(function(d){
            return y(d.excursion[3]);
        }));
        var pefr = updateAll(svg, "path", "performance line").datum(data).attr("d", d3.svg.line().x(function(d){
            return x(d.value);
        }).y(function(d){
            return y(d.performance);
        }));
        var bottom = d3.svg.axis().scale(x).tickSize(-innerHeight).orient("bottom").tickFormat(function(d){
            return screener.formatNumber(d);
        });
        var left = d3.svg.axis().scale(y).tickSize(-innerWidth).orient("left");
        var x_axis = updateAll(svg, "g", "x axis").attr("transform", "translate(0," + innerHeight + ")").call(bottom);
        var y_axis = updateAll(svg, "g", "y axis").call(left);
    }

    function updateAll(g, tag, className) {
        var selector = tag + '.' + className.replace(/\s+/g, '.');
        var selection = g.select(selector);
        if (selection.empty()) return g.append(tag).attr("class", className);
        else return selection;
    }

    function regression(i, data) {
        var n = data.reduce(function(sum, datum){
            return sum + datum.weight;
        }, 0);
        var sx = data.reduce(function(sum, datum){
            return sum + datum.weight * datum.value;
        }, 0);
        var sy = data.reduce(function(sum, datum){
            return sum + datum.weight * datum.excursion[i];
        }, 0);
        var sxx = data.reduce(function(sum, datum){
            return sum + datum.weight * datum.value * datum.weight * datum.value;
        }, 0);
        var sxy = data.reduce(function(sum, datum){
            return sum + datum.weight * datum.value * datum.weight * datum.excursion[i];
        }, 0);
        var syy = data.reduce(function(sum, datum){
            return sum + datum.weight * datum.excursion[i] * datum.weight * datum.excursion[i];
        }, 0);
        var slope = (sxy*n - sx*sy) / (sxx*n - sx*sx);
        var intercept = sy/n - slope * sx/n;
        return [intercept, slope];
    }

    function promiseSignals(cache, fuzzy) {
        if (isScreenIncomplete()) return Promise.resolve();
        return promiseFilters().then(function(filters) {
            return promiseSince().then(function(since){
                var securities = $('[rel="screener:forSecurity"]').toArray().map(function(element){
                    return element.getAttribute("resource");
                });
                var now = screener.now();
                var key = JSON.stringify([securities, filters.map(function(criteria){
                    return _.omit(criteria, 'label');
                }), since]);
                var most = JSON.stringify([securities, filters.map(function(criteria){
                    return _.omit(criteria, 'label', 'weight', 'gainIntercept', 'gainSlope', 'painIntercept', 'painSlope');
                }), since]);
                if (cache.key == key || fuzzy && cache.most == most) {
                    cache.promise = cache.promise.catch(function(){
                        return screener.signals(securities, filters, since, now);
                    });
                } else {
                    _.extend(cache, {
                        asof: new Date(),
                        key: key,
                        most: most,
                        promise: screener.signals(securities, filters, since, now)
                    });
                }
                return cache.promise;
            });
        });
    }

    function promiseSince() {
        var lookback = $('[property="screener:lookback"]').attr("content") || 20;
        return screener.promiseWorkday(-lookback);
    }

    function analyzeSignals(node, occurrences) {
        if (_.isEmpty(occurrences)) return Promise.resolve([]);
        return screener.inlineFilters([readCriteria(node)]).then(_.first).then(function(criteria){
            var securities = occurrences.reduce(function(securities, datum){
                var security = datum.security;
                var idx = _.sortedIndex(securities, security);
                if (securities[idx] != security) {
                    securities.splice(idx, 0, security);
                }
                return securities;
            }, []);
            return Promise.all(securities.map(promiseHistoric)).then(function(historic){
                return _.object(securities, historic);
            }).then(function(historic){
                var periodLength = getPeriodLength();
                return occurrences.map(function(occurrence) {
                    var signals = [occurrence.watch].concat(occurrence.holding || occurrence.hold || []);
                    return signals.map(function(hold) {
                        var points = historic[occurrence.security];
                        var start = Math.min(_.sortedIndex(points, hold, 'asof'), points.length-1);
                        var end = Math.min(start + periodLength +1, points.length);
                        var low = _.range(start, end).reduce(function(low, i){
                            return Math.min(points[i].low, low);
                        }, hold.price);
                        var high = _.range(start, end).reduce(function(high, i){
                            return Math.max(points[i].high, high);
                        }, hold.price);
                        var pain = (low - hold.price) * 100 / hold.price;
                        var gain = (high - hold.price) * 100 / hold.price;
                        var performance = (points[end-1].close - hold.price) * 100 / hold.price;
                        var value = valueOfCriteria(criteria, occurrence.watch, hold);
                        if (!value) return undefined;
                        return {
                            value: value,
                            weight: 1,
                            asof: hold.asof,
                            gain: hold.gain,
                            pain: hold.pain,
                            performance: performance,
                            excursion: [pain, pain, gain, gain]
                        };
                    });
                });
            }).then(_.flatten).then(_.compact);
        });
    }

    function promiseHistoric(security) {
        return promiseSince().then(function(since){
            var period = $('[property="screener:estimatedPeriod"]').attr("content") || "P1D";
            var interval = period.indexOf('D') >= 0 ? 'day' : 'm60';
            var fields = ['asof', 'low', 'high'].concat(interval == 'day' ? [] : 'HOUR(asof)');
            return screener.load(security, fields, interval, 1, since, screener.now());
        });
    }

    function getPeriodLength() {
        var period = $('[property="screener:estimatedPeriod"]').attr("content") || "P1D";
        return parseInt(period.match(/PT?(\d+)([DH])/)[1]);
    }

    function sortResults(data) {
        return data.reduce(function(sorted, d){
            if (!d) return sorted;
            var idx = _.sortedIndex(sorted, d, 'value');
            var e = sorted[idx];
            if (e && e.value == d.value) {
                delete e.asof;
                e.performance = (e.performance * e.weight + d.performance * d.weight) / (e.weight + d.weight);
                e.excursion[0] = Math.min(e.excursion[0], d.excursion[0]);
                e.excursion[1] = (e.excursion[1] * e.weight + d.excursion[1] * d.weight) / (e.weight + d.weight);
                e.excursion[2] = (e.excursion[2] * e.weight + d.excursion[2] * d.weight) / (e.weight + d.weight);
                e.excursion[3] = Math.max(e.excursion[3], d.excursion[3]);
                e.weight += d.weight;
            } else {
                sorted.splice(idx, 0, d);
            }
            return sorted;
        }, []);
    }

    function combineResults(sorted) {
        if (sorted.length <= 20) return sorted;
        var total = sorted.reduce(function(total, d){
            return total + d.weight;
        }, 0);
        var target = sorted.length < 40 || total < 1000 ? 10 : 20;
        var size = Math.floor(total / target);
        return sorted.reduce(function(result, d){
            var e = _.last(result);
            if (!e || result.length < target && e.weight >= size) {
                result.push(d);
            } else {
                delete e.asof;
                e.value = (e.value * e.weight + d.value * d.weight) / (e.weight + d.weight);
                e.performance = (e.performance * e.weight + d.performance * d.weight) / (e.weight + d.weight);
                e.excursion[0] = Math.min(e.excursion[0], d.excursion[0]);
                e.excursion[1] = (e.excursion[1] * e.weight + d.excursion[1] * d.weight) / (e.weight + d.weight);
                e.excursion[2] = (e.excursion[2] * e.weight + d.excursion[2] * d.weight) / (e.weight + d.weight);
                e.excursion[3] = Math.max(e.excursion[3], d.excursion[3]);
                e.weight += d.weight;
            }
            return result;
        }, []);
    }

    function workday(asof, days) {
        var weeks = Math.floor(days / 5 * 7);
        var date = new Date(asof);
        date.setDate(date.getDate() + weeks * 7 + (days - weeks * 5));
        if (date.getDay() === 0) {
            date.setDate(date.getDate() + 2);
        } else if (date.getDay() == 7) {
            date.setDate(date.getDate() + 1);
        }
        return date.toISOString();
    }

    function valueOfCriteria(crt, watch, hold) {
        var w = crt.againstCorrelated && watch.correlated ? watch.correlated : watch;
        var h = crt.againstCorrelated && hold.correlated ? hold.correlated : hold;
        var primary = crt.indicator ?
            valueOfIndicator(crt.indicator, h) :
            valueOfIndicator(crt.indicatorWatch, w);
        var diff = valueOfIndicator(crt.difference, h) || valueOfIndicator(crt.differenceWatch, w) || 0;
        var of = valueOfIndicator(crt.percent, h) || valueOfIndicator(crt.percentWatch, w);
        if (!_.isFinite(primary)) return undefined;
        else if (!of) return primary - diff;
        else return (primary - diff) * 100 / Math.abs(of);
    }

    function valueOfIndicator(indicator, reference) {
        var int = indicator && indicator.interval.value;
        if (int && reference[int]) return reference[int][indicator.expression];
        else return undefined;
    }
});
