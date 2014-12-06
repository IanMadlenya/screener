// test-intervals.js
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

describe("intervals.js", function(){
    var exchange = {
        tz: "America/New_York",
        marketOpensAt: "09:30:00",
        marketClosesAt: "16:00:00"
    };
    describe("spot check", function(){
        describe('annual', function(){
            describe('inc', function(){
                it("Fri Jan 31 2014 00:00:00 GMT-0500 (EST) by 1", function() {
                    var amount = 1;
                    var date = new Date("Fri Jan 31 2014 00:00:00 GMT-0500 (EST)");
                    var inc = intervals.annual.inc(exchange, date, amount);
                    expect(moment(inc).year()).toEqual(2015);
                });
            });
        });
        describe('m60', function(){
            describe('inc', function(){
                it("Fri Jan 31 2014 16:00:00 GMT-0500 (EST) by 1", function(){
                    var amount = 1;
                    var date = new Date("Fri Jan 31 2014 16:00:00 GMT-0500 (EST)");
                    var inc = intervals.m60.inc(exchange, date, amount);
                    expect(moment(inc).minute()).toEqual(0);
                });
            });
        });
        describe('m120', function(){
            describe('inc', function(){
                it("Fri Jan 31 2014 16:00:00 GMT-0500 (EST) by 1", function(){
                    var amount = 1;
                    var date = new Date("Fri Jan 31 2014 16:00:00 GMT-0500 (EST)");
                    var inc = intervals.m120.inc(exchange, date, amount);
                    expect(moment(inc).minute()).toEqual(0);
                });
            });
        });
        describe('d1', function(){
            describe("inc", function() {
                it("Mon Oct 13 2014 16:00:00 GMT-0400 (EDT) by 1", function(){
                    var amount = 1;
                    var date = new Date("Mon Oct 13 2014 16:00:00 GMT-0400 (EDT)");
                    var inc = intervals.d1.inc(exchange, date, amount);
                    expect(moment(inc).subtract(1,'minute').format('dddd')).toEqual(moment(date).add(1,'day').format('dddd'));
                });
                it("Wed Oct 15 2014 16:00:00 GMT-0400 (EDT) by 1", function(){
                    var amount = 1;
                    var date = new Date("Wed Oct 15 2014 16:00:00 GMT-0400 (EDT)");
                    var inc = intervals.d1.inc(exchange, date, amount);
                    expect(moment(inc).subtract(1,'minute').format('dddd')).toEqual(moment(date).add(1,'day').format('dddd'));
                });
            });
            describe("dec", function() {
                it("Wed Oct 15 2014 16:00:00 GMT-0400 (EDT) by 1", function(){
                    var amount = 1;
                    var date = new Date("Wed Oct 15 2014 16:00:00 GMT-0400 (EDT)");
                    var dec = intervals.d1.dec(exchange, date, amount);
                    expect(moment(dec).format('dddd')).toEqual(moment(date).subtract(1,'day').format('dddd'));
                });
                it("Fri Oct 17 2014 16:00:00 GMT-0400 (EDT) by 1", function(){
                    var amount = 1;
                    var date = new Date("Fri Oct 17 2014 16:00:00 GMT-0400 (EDT)");
                    var dec = intervals.d1.dec(exchange, date, amount);
                    expect(moment(dec).format('dddd')).toEqual(moment(date).subtract(1,'day').format('dddd'));
                });
            });
        });
    });
    testMinuteInterval(1);
    testMinuteInterval(5);
    testMinuteInterval(10);
    testMinuteInterval(30);
    testMinuteInterval(60);
    testMinuteInterval(120);
    describe('d1', function(){
        describe("ceil", function() {
            datesBetween(new Date(2010,0,1), new Date(2015,0,1), 60 *60 *1000).forEach(function(date){
                it(date.toString(), function(){
                    var ceil = intervals.d1.ceil(exchange, date);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(ceil.valueOf()).toEqual(jasmine.any(Number));
                    expect(ceil.valueOf() - date.valueOf() >= 0).toBe(true);
                    expect(ceil.valueOf() - date.valueOf() < 3 *24 *60 *60 *1000).toBe(true);
                });
            });
        });
        describe("floor", function() {
            datesBetween(new Date(2010,0,1), new Date(2015,0,1), 60 *60 *1000).forEach(function(date){
                it(date.toString(), function(){
                    var floor = intervals.d1.floor(exchange, date);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(floor.valueOf()).toEqual(jasmine.any(Number));
                    expect(date.valueOf() - floor.valueOf() >= 0).toBe(true);
                    expect(date.valueOf() - floor.valueOf() < 3 *24 *60 *60 *1000).toBe(true);
                });
            });
        });
        describe("inc", function() {
            var dates = datesBetween(new Date(2010,0,1), new Date(2015,0,1), 60 *60 *1000);
            var numbers = numbersBetween(0, 500, dates.length);
            dates.forEach(function(date,i,dates){
                var amount = numbers[i];
                it(date.toString() + ' by ' + amount, function(){
                    var inc = intervals.d1.inc(exchange, date, amount);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(inc.valueOf()).toEqual(jasmine.any(Number));
                    expect(inc.valueOf() - date.valueOf() > 0).toBe(true);
                    expect((inc.valueOf() - date.valueOf()) /1000 /60 /60 /24).not.toBeLessThan(amount);
                    expect((inc.valueOf() - date.valueOf()) /1000 /60 /60 /24).toBeLessThan(Math.ceil(amount /5) *7 +3);
                });
            });
        });
        describe("dec", function() {
            var dates = datesBetween(new Date(2010,0,1), new Date(2015,0,1), 60 *60 *1000);
            var numbers = numbersBetween(0, 500, dates.length);
            dates.forEach(function(date,i,dates){
                var amount = numbers[i];
                it(date.toString() + ' by ' + amount, function(){
                    var dec = intervals.d1.dec(exchange, date, amount);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(dec.valueOf()).toEqual(jasmine.any(Number));
                    expect(dec.valueOf() % 60 *1000).toEqual(0);
                    expect(date.valueOf() - dec.valueOf() > 0).toBe(true);
                    expect((date.valueOf() - dec.valueOf()) /1000 /60 /60 /24).not.toBeLessThan(amount);
                    expect((date.valueOf() - dec.valueOf()) /1000 /60 /60 /24).toBeLessThan(Math.ceil(amount /5) *7 +3);
                });
            });
        });
    });
    describe('d5', function(){
        describe("ceil", function() {
            datesBetween(new Date(2010,0,1), new Date(2015,0,1), 5 *60 *60 *1000).forEach(function(date){
                it(date.toString(), function(){
                    var ceil = intervals.d5.ceil(exchange, date);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(ceil.valueOf()).toEqual(jasmine.any(Number));
                    expect(ceil.valueOf() - date.valueOf() >= 0).toBe(true);
                    expect(ceil.valueOf() - date.valueOf() < 7 *24 *60 *60 *1000).toBe(true);
                });
            });
        });
        describe("floor", function() {
            datesBetween(new Date(2010,0,1), new Date(2015,0,1), 5 *60 *60 *1000).forEach(function(date){
                it(date.toString(), function(){
                    var floor = intervals.d5.floor(exchange, date);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(floor.valueOf()).toEqual(jasmine.any(Number));
                    expect(date.valueOf() - floor.valueOf() >= 0).toBe(true);
                    expect(date.valueOf() - floor.valueOf() < 7 *24 *60 *60 *1000).toBe(true);
                });
            });
        });
        describe("inc", function() {
            var dates = datesBetween(new Date(2010,0,1), new Date(2015,0,1), 5 *60 *60 *1000);
            var numbers = numbersBetween(0, 500, dates.length);
            dates.forEach(function(date,i,dates){
                var amount = numbers[i];
                it(date.toString() + ' by ' + amount, function(){
                    var inc = intervals.d5.inc(exchange, date, amount);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(inc.valueOf()).toEqual(jasmine.any(Number));
                    expect(inc.valueOf() - date.valueOf() > 0).toBe(true);
                    expect((inc.valueOf() - date.valueOf()) /1000 /60 /60 /24).not.toBeLessThan(5 * amount);
                    expect((inc.valueOf() - date.valueOf()) /1000 /60 /60 /24).toBeLessThan(amount *7 +7);
                });
            });
        });
        describe("dec", function() {
            var dates = datesBetween(new Date(2010,0,1), new Date(2015,0,1), 5 *60 *60 *1000);
            var numbers = numbersBetween(0, 500, dates.length);
            dates.forEach(function(date,i,dates){
                var amount = numbers[i];
                it(date.toString() + ' by ' + amount, function(){
                    var dec = intervals.d5.dec(exchange, date, amount);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(dec.valueOf()).toEqual(jasmine.any(Number));
                    expect(dec.valueOf() % 5 *60 *1000).toEqual(0);
                    expect(date.valueOf() - dec.valueOf() > 0).toBe(true);
                    expect((date.valueOf() - dec.valueOf()) /1000 /60 /60 /24).not.toBeLessThan(5 * amount);
                    expect((date.valueOf() - dec.valueOf()) /1000 /60 /60 /24).toBeLessThan(amount *7 +7);
                });
            });
        });
    });
});

function testMinuteInterval(size) {
    var exchange = {
        tz: "America/New_York",
        marketOpensAt: "09:30:00",
        marketClosesAt: "16:00:00"
    };
    describe('m' + size, function(){
        describe("ceil", function() {
            datesBetween(new Date(2010,0,1), new Date(2015,0,1), size * 1000).forEach(function(date){
                it(date.toString(), function(){
                    var ceil = intervals['m' + size].ceil(exchange, date);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(ceil.valueOf()).toEqual(jasmine.any(Number));
                    expect(ceil.valueOf() % size *60 *1000).toEqual(0);
                    expect(ceil.valueOf() - date.valueOf() >= 0).toBe(true);
                    expect(ceil.valueOf() - date.valueOf() < size * 60000).toBe(true);
                    if (size < 60) expect(ceil.valueOf() == date.valueOf()).toBe(date.valueOf() % (size * 60*1000) === 0);
                });
            });
        });
        describe("floor", function() {
            datesBetween(new Date(2010,0,1), new Date(2015,0,1), size * 1000).forEach(function(date){
                it(date.toString(), function(){
                    var floor = intervals['m' + size].floor(exchange, date);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(floor.valueOf()).toEqual(jasmine.any(Number));
                    expect(floor.valueOf() % size *60 *1000).toEqual(0);
                    expect(date.valueOf() - floor.valueOf() >= 0).toBe(true);
                    expect(date.valueOf() - floor.valueOf() < size * 60000).toBe(true);
                    if (size < 60) expect(date.valueOf() == floor.valueOf()).toBe(date.valueOf() % (size * 60*1000) === 0);
                });
            });
        });
        describe("inc", function() {
            var dates = datesBetween(new Date(2010,0,1), new Date(2015,0,1), size * 1000);
            var numbers = numbersBetween(0, 500, dates.length);
            dates.forEach(function(date,i,dates){
                var amount = numbers[i];
                it(date.toString() + ' by ' + amount, function(){
                    var inc = intervals['m' + size].inc(exchange, date, amount);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(inc.valueOf()).toEqual(jasmine.any(Number));
                    expect(inc.valueOf() % size *60 *1000).toEqual(0);
                    expect(inc.valueOf() - date.valueOf() > 0).toBe(true);
                    expect((inc.valueOf() - date.valueOf()) /1000 /60).not.toBeLessThan(size * amount);
                    expect((inc.valueOf() - date.valueOf()) /1000 /60).toBeLessThan(Math.ceil(size * amount /60 /6.5 /5) *7 *24 *60 +2 *24 *60);
                    var opens = moment.tz(inc.format('YYYY-MM-DD') + 'T' + exchange.marketOpensAt, exchange.tz);
                    var closes = moment.tz(inc.format('YYYY-MM-DD') + 'T' + exchange.marketClosesAt, exchange.tz);
                    expect(inc.valueOf() >= opens.valueOf()).toBe(true);
                    expect(inc.valueOf() <= closes.valueOf()).toBe(true);
                });
            });
        });
        describe("dec", function() {
            var dates = datesBetween(new Date(2010,0,1), new Date(2015,0,1), size * 1000);
            var numbers = numbersBetween(0, 500, dates.length);
            dates.forEach(function(date,i,dates){
                var amount = numbers[i];
                it(date.toString() + ' by ' + amount, function(){
                    var dec = intervals['m' + size].dec(exchange, date, amount);
                    expect(date.valueOf()).toEqual(jasmine.any(Number));
                    expect(dec.valueOf()).toEqual(jasmine.any(Number));
                    expect(dec.valueOf() % size *60 *1000).toEqual(0);
                    expect(date.valueOf() - dec.valueOf() > 0).toBe(true);
                    expect((date.valueOf() - dec.valueOf()) /1000 /60).not.toBeLessThan(size * amount);
                    expect((date.valueOf() - dec.valueOf()) /1000 /60).toBeLessThan(Math.ceil(size * amount /60 /6.5 /5) *7 * 24 *60 +2 *24 *60);
                    var opens = moment.tz(dec.format('YYYY-MM-DD') + 'T' + exchange.marketOpensAt, exchange.tz);
                    var closes = moment.tz(dec.format('YYYY-MM-DD') + 'T' + exchange.marketClosesAt, exchange.tz);
                    expect(dec.valueOf() >= opens.valueOf()).toBe(true);
                    expect(dec.valueOf() <= closes.valueOf()).toBe(true);
                });
            });
        });
    });
}

function datesBetween(start, stop, step) {
    var result = [];
    var f0 = 0, f1 = 1;
    var reset = (stop.valueOf() - start.valueOf())/step/10;
    var time = start.valueOf();
    while (time < stop.valueOf()) {
        if (f1 > reset) {
            f0 = 0;
            f1 = 1;
        } else {
            f1 = f0 + f1;
            f0 = f1 - f0;
        }
        time = time + f1 * step;
        result.push(new Date(time));
    }
    return result;
}

function numbersBetween(min, max, length) {
    var result = new Array(length);
    var f0 = 0, f1 = 1;
    for (var i=0;i<length;i++) {
        if (min + f0 + f1 > max) {
            f0 = 0;
            f1 = 1;
        } else {
            f1 = f0 + f1;
            f0 = f1 - f0;
        }
        result[i] = min + f1;
    }
    return result;
    
}
