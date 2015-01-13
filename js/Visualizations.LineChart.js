(function (main) {
  /* jshint unused:true, jquery:true, curly:false, browser:true */
  /* global d3 */
  /* global utils */
  /* global ColorScale */
  'use strict';

  function calculateDepth (data, depth) {
    if (Utils.isArray(data) && Utils.isObject(data[0])) {
      depth++;
      if (Utils.isArray(data[0].values)) depth = calculateDepth(data[0].values, depth);
    }
    return depth;
  }

  function scrollTween (scrollTop) {
    return function () {
      var i = d3.interpolateNumber(this.scrollTop, scrollTop);
      return function (t) { this.scrollTop = i(t); };
    };
  }

  function sortData (data) {
    if (!Utils.isArray(data.values))
      return false;

    data.values.sort(function (a, b) {
      return b.size - a.size;
    });
    data.values.forEach(function (node, position) {
      node.__x__ = position;
      sortData(node);
    });

    return true;
  }

  var LineChart = function (container, data, opts) {
    this.container = d3.select(container);
    opts = jQuery.isPlainObject(opts) ? opts : {};
    this.options = jQuery.extend({}, LineChart.DEFAULTS, opts);
    this.animations = false;
    this.init();

    if (jQuery.isPlainObject(data) && !jQuery.isEmptyObject(data)) {
      this.setData(data);
    }

    //hide dom filters
    var filter = container.parentNode.querySelector('.filterinfo');
    if (filter)
      filter.style.display = 'none';
  };

  LineChart.key = function (data) {
    return data.key;
  };

  LineChart.hasChildren = function (data) {
    return data.values && Utils.isArray(data.values);
  };

  LineChart.DEFAULTS = {
    width: 400,
    height: 300,
    margin: {top: 5, left: 5, bottom: 0, right: 5},
    colors: ['#f7fbff', '#deebf7', '#c6dbef'],
    padding: {
       top: 0,
       right: 5,
       bottom: 0,
       left: 5
    },
    colorProperty: 'color',
    sizeFormat: 'currency',
    'background-color': '#F1F5F8'

  };

  LineChart.prototype.init = function () {
    var self = this;
    var visContainer;
    this.options.width = parseInt(this.options.width, 10);
    this.options.height = parseInt(this.options.height, 10);
    this.levelsRendered = 0;
    this.events = {
      'filter': [],
      'remove-filter': []
    };

    this.filters = {};

    this.barContainer = this.container.append('div');

    this.barContainer.attr({
      'class': 'line-chart-container no-animation'
    }).style({
      'background-color': this.options['background-color'],
      'padding-top': this.options.padding.top + 'px',
      'padding-bottom': this.options.padding.bottom + 'px',
      'height': this.options.height + 'px',
      'width' : this.options.widht + 'px'
    });


    this.setColors(this.options.colors);
    this.scale = d3.scale.linear();
    this.scale.clamp(true).range([1, 100]);

    this.barContainer.node().addEventListener('click', function (event) {
      var target = $(event.target || event.srcElement);
      var selector = 'div.line-container';
      var line = target.is(selector) ? target : target.parents(selector);

      if (line.length)
        self.toggleSelect(line[0]);
    });
  };

  LineChart.prototype.setData = function (data) {
    this.depth = 0;
    if (!this.unfilteredData)
      this.unfilteredData = data;

    this.data = data;
    //order data
    sortData(data);
    console.log(data);
    this.depth = calculateDepth(this.data.values, this.depth);
    return this;
  };

  LineChart.prototype.setColors = function (colors) {
    this.colorScale = d3.scale.threshold();
    this.colorScale.range(colors);
    this.setColorDomain();
    return this;
  };

  LineChart.prototype.setColorDomain = function () {
    var domain = [];
    var length = this.colorScale.range().length;
    var step = 1 / length;
    for (var i = 1; i < length; i++) {
      domain.push(i * step);
    }
    this.colorScale.domain(domain);
    return this;
  };

  LineChart.prototype.adjustColorDomain = function (data) {
    this.colorScale.max = d3.max(Utils.pluck(data, this.options.colorProperty));
    return this;
  };

  LineChart.prototype.getColor = function (scale, color) {
    var max = this[scale].max;
    var fraction = color > 0 ? color / max : 0;
    var colorStr = this[scale](color);
    return colorStr;
  };

  LineChart.prototype.animate = function (animate) {
    if (arguments.length) {
      this.animations = !!animate;
      return this;
    }

    return this.animations;
  };

  LineChart.prototype.adjustScale = function (data) {
    this.scale.domain([0, d3.max(Utils.pluck(data, 'size'))]);
    return this;
  };

  LineChart.prototype.toggleSelect = function (line) {
    var data;
    var isSelected;
    var container = d3.select(line.parentNode);
    line = d3.select(line);
    isSelected = line.classed('selected', !line.classed('selected')).classed('selected');
    data = line.node().__data__;
    container.classed('has-selected', container.selectAll('.selected').size() > 0);
    if (isSelected) {
      container.transition().duration(350).tween('scroll', scrollTween(0));
      this.addFilter(data).renderChildren(data);
    } else {
      this.removeChildren(container.node());
    }
  };

  LineChart.prototype.getBarHeight = function () {
    if (!this.barHeight) {
      var bar = this.barContainer.select('.line-container');
      this.barHeight = parseInt(bar.style('height'), 10);
    }
    return this.barHeight;
  };

  LineChart.prototype.render = function (data, levelContainer) {
    data = data || this.data.values;
    this.adjustScale(data).adjustColorDomain(data);
    if (!levelContainer) {
      levelContainer = this.barContainer.append('div').attr({
        'class': 'line-chart'
      });
      this.increaseLevel();
    }
    var container = levelContainer.selectAll('div.line-container').data(data, LineChart.key);
    var self = this;
    var newLines = container.enter();
    var height = 0;
    var lines;
    var transition;
    var opacity = 1;

    container.exit().remove();
    newLines.append('div').attr({
      'class': 'line-container'
    }).style({
      'background-color': this.options['background-color'],
      'padding-left': this.options.padding.left + 'px',
      'padding-right': this.options.padding.right + 'px',
      'top': '0px'
    }).each(function () {
      var line = d3.select(this);
      var label = line.append('div').attr('class', 'label-container');
      line.append('div').attr('class', 'line-shadow start').append('div').attr('class', 'line');
      label.append('div').attr('class', 'croptext key-label');
      label.append('div').attr('class', 'size-label');
    });

    container.each(function () {
      var node = d3.select(this);
      node.select('.line').style({
        width: function (data) {
          return self.scale(data.size < 0 ? 0 : data.size) + '%';
        },
        'background-color': function (data) {
          return self.getColor('colorScale', data[self.options.colorProperty]);
        }
      });

      node.select('.key-label').text(function (data) {
        return data.key;
      });
      node.select('.size-label').text(function (data) {
        return self.options.numericFormat(data.size);
      });
    });

    height = this.getBarHeight();
    if (this.levelsRendered > 1) {
      levelContainer.style({top: height + 'px'});
    } else if (this.barContainer.classed('no-animation')) {
      container.style('top', function (data) {
        return (data.__x__ * height) + 'px';
      });
    }

    //remove the start class to fire the transition

    transition = levelContainer;
    if (this.levelsRendered > 1) {
      opacity = 0;
      transition = levelContainer.transition().delay(650);
      transition.duration(350).ease('linear');
    }

    levelContainer.style({
      'opacity': opacity
    });

    d3.timer(function () {
      container.style('top', function (data) {
        return (data.__x__ * height) + 'px';
      });
      container.selectAll('.line-shadow').classed('start', false);
      self.barContainer.classed('no-animation', false);
      transition.style({
        'opacity': 1
      });
      return true;
    }, 100);
  };

  LineChart.prototype.renderChildren = function (data) {
    if (LineChart.hasChildren(data))
      this.render(data.values);
    return this;
  };

  LineChart.prototype.removeChildren = function (parent) {
    var children = [];
    var next = parent.nextSibling;
    var self = this;
    var promises = [];
    var master;
    while (next) {
      children.unshift(next);
      next = next.nextSibling;
    }
    children.forEach(function (node) {
      promises.push(self.closeLevel(node));
    });
    master = jQuery.when.apply(null, promises);
    master.done(function () {
      d3.select(parent).classed('has-selected', false).selectAll('.line-container.selected').classed('selected', false);
      self.clearFilters();
    });
    return master;
  };

  LineChart.prototype.closeLevel = function (container) {
    container = d3.select(container);
    var deferred = Utils.deferred();
    if (!container.classed('line-chart')) {
      return deferred.resolveWith(this).promise();
    }
    var transition = container.transition();
    transition.style({
      'opacity': 0
    }).duration(250)
      .ease('linear').each('end', function () {
      deferred.resolveWith(this);
    }).remove();
    this.decreaseLevel();
    return deferred.promise();
  };

  LineChart.prototype.increaseLevel = function () {
    this.levelsRendered++;
    return this;
  };

  LineChart.prototype.decreaseLevel = function () {
    this.levelsRendered--;
    if (this.levelsRendered <= 0)
      this.levelsRendered = 1;
    return this;
  };

  LineChart.prototype.addFilter = function (group) {
    var uid = this.generateUID(group.key);
    if (!(uid in this.filters))
      this.filters[uid] = {name: group.key};

    this.trigger('filter', [this.filters]);
    return this;
  };

  LineChart.prototype.updateFilterInfo = function (filters) {
    if (!Utils.isArray(filters))
      return this;

    var self = this;
    filters.forEach(function(filter) {
      var key = self.generateUID(filter.value);
      if (key in self.filters && filter.id)
        self.filters[key].id = filter.id;
    });
  };

  LineChart.prototype.generateUID = function (str) {
    str = (str || '').replace(/[^a-z0-9]/i, '');
    return str + str.length;
  };

  LineChart.prototype.removeFilter = function (group) {
    var uid = this.generateUID(group.key);
    var filters;
    var index;
    if (!(uid in this.filters)) {
      return this;
    }
    filters = [this.filters[uid]];
    delete this.filters[uid];

    this.trigger('remove-filter', [filters]);
    return this;
  };

  LineChart.prototype.clearFilters = function () {
    var filters = [];
    var key;
    for (key in this.filters) {
      filters.push(this.filters[key]);
    }
    this.filters = {};
    this.trigger('remove-filter', [filters]);
    return this;
  };

  /**
   * Adds an event listener
   * @param String type event name
   * @param Function callback to execute
   * @return LineChart
   *
   */
  LineChart.prototype.addEventListener = function (type, callback) {
    if (!(type in this.events)) {
      this.events[type] = [];
    }
    this.events[type].push(callback);
    return this;
  };

  /**
   * Triggers an event calling all of the callbacks attached to it.
   * @param String type event name
   * @param Array args to pass to the callback
   * @param Object thisArg to execute the callback in a certain context
   * @return LineChart
   *
   */
  LineChart.prototype.trigger = function (type, args, thisArg) {
    if ((type in this.events) && this.events[type].length) {
      args = jQuery.isArray(args) ? args : [];
      thisArg = thisArg || this;
      this.events[type].forEach(function (callback) {
        callback.apply(thisArg, args);
      });
    }
    return this;
  };


  if (!('Visualizations' in main))
    main.Visualizations = {};

  main.Visualizations.LineChart = LineChart;

})(this);
