// criteria.js
/* 
 *  Copyright (c) 2015 James Leigh, Some Rights Reserved
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

    populateLabel();
    initializeSelectElements();
    initializeWatchIndicatorState();
    initializeWatchReferenceState();

    function populateLabel() {
        var hash = window.location.hash.substring(1);
        if (hash) {
            $('#label').val(decodeURIComponent(hash));
        }
    }

    function initializeSelectElements() {
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
            $('select[name="indicator"]').change(function(){
                var value = $(this).val();
                if (!value || !this.selectize) return;
                var option = this.selectize.options[value];
                var optgroup = this.selectize.optgroups[option.optgroup];
                $('select[name="indicatorReference"]').toArray().forEach(function(select){
                    var item = $(select).val();
                    select.selectize.clearOptions();
                    select.selectize.addOption(optgroup.references);
                    select.selectize.addItem(item);
                    select.selectize.refreshOptions(false);
                });
            });
            $('select[name="indicator"],select[name="indicatorReference"]').selectize({
                searchField: ['text', 'title', 'expression'],
                sortField: [{field:'optorder'}, {field:'text'}],
                options: items,
                optgroups: _.uniq(_.pluck(items, 'optgroup')).map(function(optgroup){
                    var sample = _.find(items, function(item){
                        return item.optgroup == optgroup;
                    });
                    return {
                        value: optgroup,
                        label: optgroup,
                        references: items.filter(function(item){
                            return item.unit.value == sample.unit.value &&
                                item.optorder <= sample.optorder;
                        })
                    };
                }),
                render: {
                    item: function(data, escape) {
                        return '<div title="' + escape(data.title || '') + '">' + escape(data.text) + '</div>';
                    }
                }
            }).change();
        });
    }

    function initializeWatchIndicatorState() {
        var holdCriteria = !$('[rel="screener:forWatchIndicator"]').attr("resource");
        $('#holdCriteria').prop("checked", holdCriteria).change(function(){
            if (this.checked) {
                toggleSelect('#forWatchIndicator', '#forIndicator');
            } else {
                toggleSelect('#forIndicator', '#forWatchIndicator');
            }
        }).change();
    }

    function initializeWatchReferenceState() {
        var holdReference = !$('[rel="screener:differenceFromWatch"]').attr("resource") && !$('[rel="screener:percentOfWatch"]').attr("resource")
        $('#holdReference').prop("checked", holdReference).change(function(){
            if (this.checked) {
                toggleSelect('#differenceFromWatch', '#differenceFrom');
                toggleSelect('#percentOfWatch', '#percentOf');
            } else {
                toggleSelect('#differenceFrom', '#differenceFromWatch');
                toggleSelect('#percentOf', '#percentOfWatch');
            }
        }).change();
    }

    function toggleSelect(disable, enable) {
        $(disable).closest('.form-group').addClass("hidden");
        $(enable).closest('.form-group').removeClass("hidden");
        if ($(disable)[0].selectize && $(disable).val()) {
            $(enable)[0].selectize.setValue($(enable).val() || $(disable).val());
            $(disable)[0].selectize.clear();
        }
    }
});
