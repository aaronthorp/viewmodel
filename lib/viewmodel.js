(function() {
    var isArray,
      slice = [].slice,
      indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };
  
    isArray = function(obj) {
      return obj instanceof Array || Array.isArray(obj);
    };
  
    ViewModel = (function() {
      var _nextId, _t, childrenProperty, currentContext, currentView, delayed, dotRegex, firstToken, getBindHelper, getDelayedSetter, getMatchingParenIndex, getPrimitive, getValue, isPrimitive, loadMixinShare, loadToContainer, quoted, removeQuotes, setValue, signalContainer, stringRegex, tokenGroup, tokens;
  
      _nextId = 1;
  
      ViewModel.nextId = function() {
        return _nextId++;
      };
  
      ViewModel.persist = true;
  
      ViewModel.properties = {
        autorun: 1,
        events: 1,
        share: 1,
        mixin: 1,
        signal: 1,
        ref: 1,
        load: 1,
        onRendered: 1,
        onCreated: 1,
        onDestroyed: 1
      };
  
      ViewModel.reserved = {
        vmId: 1,
        vmPathToParent: 1,
        vmOnCreated: 1,
        vmOnRendered: 1,
        vmOnDestroyed: 1,
        vmAutorun: 1,
        vmEvents: 1,
        vmInitial: 1,
        vmProp: 1,
        templateInstance: 1,
        templateName: 1,
        parent: 1,
        children: 1,
        child: 1,
        reset: 1,
        data: 1,
        b: 1
      };
  
      ViewModel.nonBindings = {
        throttle: 1,
        optionsText: 1,
        optionsValue: 1,
        defaultText: 1,
        defaultValue: 1
      };
  
      ViewModel.funPropReserved = {
        valid: 1,
        validMessage: 1,
        invalid: 1,
        invalidMessage: 1,
        validating: 1,
        message: 1
      };
  
      ViewModel.bindObjects = {};
  
      ViewModel.byId = {};
  
      ViewModel.byTemplate = {};
  
      ViewModel.add = function(viewmodel) {
        var templateName;
        ViewModel.byId[viewmodel.vmId] = viewmodel;
        templateName = ViewModel.templateName(viewmodel.templateInstance);
        if (templateName) {
          if (!ViewModel.byTemplate[templateName]) {
            ViewModel.byTemplate[templateName] = {};
          }
          return ViewModel.byTemplate[templateName][viewmodel.vmId] = viewmodel;
        }
      };
  
      ViewModel.remove = function(viewmodel) {
        var templateName;
        delete ViewModel.byId[viewmodel.vmId];
        templateName = ViewModel.templateName(viewmodel.templateInstance);
        if (templateName) {
          return delete ViewModel.byTemplate[templateName][viewmodel.vmId];
        }
      };
  
      ViewModel.find = function(templateNameOrPredicate, predicateOrNothing) {
        var predicate, templateName, vmCollection, vmCollectionValues;
        templateName = _.isString(templateNameOrPredicate) && templateNameOrPredicate;
        predicate = templateName ? predicateOrNothing : _.isFunction(templateNameOrPredicate) && templateNameOrPredicate;
        vmCollection = templateName ? ViewModel.byTemplate[templateName] : ViewModel.byId;
        if (!vmCollection) {
          return void 0;
        }
        vmCollectionValues = _.values(vmCollection);
        if (predicate) {
          return _.filter(vmCollection, predicate);
        } else {
          return vmCollectionValues;
        }
      };
  
      ViewModel.findOne = function(templateNameOrPredicate, predicateOrNothing) {
        return _.first(ViewModel.find(templateNameOrPredicate, predicateOrNothing));
      };
  
      ViewModel.check = function() {
        var args, key, ref1;
        key = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
        if (Meteor.isDev && !ViewModel.ignoreErrors) {
          if ((ref1 = Package['manuel:viewmodel-debug']) != null) {
            ref1.VmCheck.apply(ref1, [key].concat(slice.call(args)));
          }
        }
      };
  
      ViewModel.onCreated = function(template) {
        return function() {
          var autoLoadData, fun, helpers, j, len, loadData, parentTemplate, prop, ref1, ref2, templateInstance, viewmodel;
          templateInstance = this;
          viewmodel = template.createViewModel(templateInstance.data);
          templateInstance.viewmodel = viewmodel;
          viewmodel.templateInstance = templateInstance;
          ViewModel.add(viewmodel);
          if ((ref1 = templateInstance.data) != null ? ref1.ref : void 0) {
            parentTemplate = ViewModel.parentTemplate(templateInstance);
            if (parentTemplate) {
              if (!parentTemplate.viewmodel) {
                ViewModel.addEmptyViewModel(parentTemplate);
              }
              viewmodel.parent()[templateInstance.data.ref] = viewmodel;
            }
          }
          loadData = function() {
            return ViewModel.delay(0, function() {
              var j, len, migrationData, obj, ref2, vmHash;
              if (templateInstance.isDestroyed) {
                return;
              }
              ViewModel.assignChild(viewmodel);
              ref2 = ViewModel.globals;
              for (j = 0, len = ref2.length; j < len; j++) {
                obj = ref2[j];
                viewmodel.load(obj);
              }
              vmHash = viewmodel.vmHash();
              if (migrationData = Migration.get(vmHash)) {
                viewmodel.load(migrationData);
                ViewModel.removeMigration(viewmodel, vmHash);
              }
              if (viewmodel.onUrl) {
                ViewModel.loadUrl(viewmodel);
                return ViewModel.saveUrl(viewmodel);
              }
            });
          };
          autoLoadData = function() {
            return templateInstance.autorun(function() {
              return viewmodel.load(Template.currentData());
            });
          };
          if (Tracker.currentComputation) {
            loadData();
            ViewModel.delay(0, autoLoadData);
          } else {
            autoLoadData();
            Tracker.afterFlush(function() {
              return loadData();
            });
          }
          ref2 = viewmodel.vmOnCreated;
          for (j = 0, len = ref2.length; j < len; j++) {
            fun = ref2[j];
            fun.call(viewmodel, templateInstance);
          }
          helpers = {};
          for (prop in viewmodel) {
            if (!ViewModel.reserved[prop]) {
              (function(prop) {
                return helpers[prop] = function() {
                  var args, instanceVm;
                  args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
                  instanceVm = Template.instance().viewmodel;
                  if (instanceVm[prop]) {
                    return instanceVm[prop].apply(instanceVm, args);
                  }
                };
              })(prop);
            }
          }
          template.helpers(helpers);
        };
      };
  
      ViewModel.bindIdAttribute = 'b-id';
  
      ViewModel.addEmptyViewModel = function(templateInstance) {
        var onCreated, onDestroyed, onRendered, template;
        template = templateInstance.view.template;
        template.viewmodelInitial = {};
        onCreated = ViewModel.onCreated(template, template.viewmodelInitial);
        onCreated.call(templateInstance);
        onRendered = ViewModel.onRendered(template.viewmodelInitial);
        onRendered.call(templateInstance);
        onDestroyed = ViewModel.onDestroyed(template.viewmodelInitial);
        templateInstance.view.onViewDestroyed(function() {
          return onDestroyed.call(templateInstance);
        });
      };
  
      getBindHelper = function(useBindings) {
        var bindIdAttribute;
        bindIdAttribute = ViewModel.bindIdAttribute;
        if (!useBindings) {
          bindIdAttribute += "-e";
        }
        return function(bindString) {
          var bindId, bindIdObj, bindObject, bindings, currentView, currentViewInstance, templateInstance;
          bindId = ViewModel.nextId();
          bindObject = ViewModel.parseBind(bindString);
          ViewModel.bindObjects[bindId] = bindObject;
          templateInstance = Template.instance();
          if (!templateInstance.viewmodel) {
            ViewModel.addEmptyViewModel(templateInstance);
          }
          bindings = useBindings ? ViewModel.bindings : _.pick(ViewModel.bindings, 'default');
          currentView = Blaze.currentView;
          currentViewInstance = currentView._templateInstance || templateInstance;
          Tracker.afterFlush(function() {
            var element;
            if (currentView.isDestroyed) {
              return;
            }
            element = currentViewInstance.$("[" + bindIdAttribute + "='" + bindId + "']");
            if (element.length && !element[0].vmBound) {
              if (!element.removeAttr) {
                return;
              }
              element[0].vmBound = true;
              element.removeAttr(bindIdAttribute);
              return templateInstance.viewmodel.bind(bindObject, templateInstance, element, bindings, bindId, currentView);
            }
          });
          bindIdObj = {};
          bindIdObj[bindIdAttribute] = bindId;
          return bindIdObj;
        };
      };
  
      ViewModel.bindHelper = getBindHelper(true);
  
      ViewModel.eventHelper = getBindHelper(false);
  
      ViewModel.getInitialObject = function(initial, context) {
        if (_.isFunction(initial)) {
          return initial(context) || {};
        } else {
          return initial || {};
        }
      };
  
      delayed = {};
  
      ViewModel.delay = function(time, nameOrFunc, fn) {
        var d, func, id, name;
        func = fn || nameOrFunc;
        if (fn) {
          name = nameOrFunc;
        }
        if (name) {
          d = delayed[name];
        }
        if (d != null) {
          Meteor.clearTimeout(d);
        }
        id = Meteor.setTimeout(func, time);
        if (name) {
          return delayed[name] = id;
        }
      };
  
      ViewModel.makeReactiveProperty = function(initial, viewmodel) {
        var _value, dependency, funProp, getDone, hasAsync, initialValue, reset, validDependency, validatingItems, validationAsync, validator;
        dependency = new Tracker.Dependency();
        initialValue = initial instanceof ViewModel.Property ? initial.defaultValue : initial;
        _value = void 0;
        reset = function() {
          if (isArray(initialValue)) {
            return _value = new ReactiveArray(initialValue, dependency);
          } else {
            return _value = initialValue;
          }
        };
        reset();
        validator = initial instanceof ViewModel.Property ? initial : ViewModel.Property.validator(initial);
        funProp = function(value) {
          var changeValue;
          if (arguments.length) {
            if (_value !== value) {
              changeValue = function() {
                if (validator.beforeUpdates.length) {
                  validator.beforeValueUpdate(_value, viewmodel);
                }
                if (isArray(value)) {
                  _value = new ReactiveArray(value, dependency);
                } else {
                  _value = value;
                }
                if (validator.convertIns.length) {
                  _value = validator.convertValueIn(_value, viewmodel);
                }
                if (validator.afterUpdates.length) {
                  validator.afterValueUpdate(_value, viewmodel);
                }
                return dependency.changed();
              };
              if (funProp.delay > 0) {
                ViewModel.delay(funProp.delay, funProp.vmProp, changeValue);
              } else {
                changeValue();
              }
            }
          } else {
            dependency.depend();
          }
          if (validator.convertOuts.length) {
            return validator.convertValueOut(_value, viewmodel);
          } else {
            return _value;
          }
        };
        funProp.reset = function() {
          reset();
          return dependency.changed();
        };
        funProp.depend = function() {
          return dependency.depend();
        };
        funProp.changed = function() {
          return dependency.changed();
        };
        funProp.delay = 0;
        funProp.vmProp = ViewModel.nextId();
        hasAsync = validator.hasAsync();
        validDependency = void 0;
        validatingItems = void 0;
        if (hasAsync) {
          validDependency = new Tracker.Dependency();
          validatingItems = new ReactiveArray();
        }
        validationAsync = {};
        getDone = hasAsync ? function(initialValue) {
          validatingItems.push(1);
          return function(result) {
            validatingItems.pop();
            if (_value === initialValue && !((validationAsync.value === _value) || result)) {
              validationAsync = {
                value: _value
              };
              return validDependency.changed();
            }
          };
        } : void 0;
        funProp.valid = function(noAsync) {
          dependency.depend();
          if (hasAsync) {
            validDependency.depend();
          }
          if (validationAsync && validationAsync.hasOwnProperty('value') && validationAsync.value === _value) {
            return false;
          } else {
            if (hasAsync && !noAsync) {
              validator.verifyAsync(_value, getDone(_value), viewmodel);
            }
            return validator.verify(_value, viewmodel);
          }
        };
        funProp.validMessage = function() {
          return validator.validMessageValue;
        };
        funProp.invalid = function(noAsync) {
          return !this.valid(noAsync);
        };
        funProp.invalidMessage = function() {
          return validator.invalidMessageValue;
        };
        funProp.validating = function() {
          if (!hasAsync) {
            return false;
          }
          validatingItems.depend();
          return !!validatingItems.length;
        };
        funProp.message = function() {
          if (this.valid(true)) {
            return validator.validMessageValue;
          } else {
            return validator.invalidMessageValue;
          }
        };
        Object.defineProperty(funProp, 'value', {
          get: function() {
            return _value;
          }
        });
        return funProp;
      };
  
      ViewModel.bindings = {};
  
      ViewModel.addBinding = function(binding) {
        var bindingArray, bindings;
        ViewModel.check("@addBinding", binding);
        if (!binding.priority) {
          binding.priority = 1;
        }
        if (binding.selector) {
          binding.priority++;
        }
        if (binding.bindIf) {
          binding.priority++;
        }
        bindings = ViewModel.bindings;
        if (!bindings[binding.name]) {
          bindings[binding.name] = [];
        }
        bindingArray = bindings[binding.name];
        bindingArray[bindingArray.length] = binding;
      };
  
      ViewModel.addAttributeBinding = function(attrs) {
        var attr, fn1, j, len;
        if (isArray(attrs)) {
          fn1 = function(attr) {
            return ViewModel.addBinding({
              name: attr,
              bind: function(bindArg) {
                bindArg.autorun(function() {
                  return bindArg.element[0].setAttribute(attr, bindArg.getVmValue(bindArg.bindValue[attr]));
                });
              }
            });
          };
          for (j = 0, len = attrs.length; j < len; j++) {
            attr = attrs[j];
            fn1(attr);
          }
        } else if (_.isString(attrs)) {
          ViewModel.addBinding({
            name: attrs,
            bind: function(bindArg) {
              bindArg.autorun(function() {
                return bindArg.element[0].setAttribute(attrs, bindArg.getVmValue(bindArg.bindValue[attrs]));
              });
            }
          });
        }
      };
  
      ViewModel.getBinding = function(bindName, bindArg, bindings) {
        var binding, bindingArray;
        binding = null;
        bindingArray = bindings[bindName];
        if (bindingArray) {
          if (bindingArray.length === 1 && !(bindingArray[0].bindIf || bindingArray[0].selector)) {
            binding = bindingArray[0];
          } else {
            binding = _.find(_.sortBy(bindingArray, (function(b) {
              return -b.priority;
            })), function(b) {
              return !((b.bindIf && !b.bindIf(bindArg)) || (b.selector && !bindArg.element.is(b.selector)));
            });
          }
        }
        return binding || ViewModel.getBinding('default', bindArg, bindings);
      };
  
      getDelayedSetter = function(bindArg, setter, bindId) {
        if (bindArg.elementBind.throttle) {
          return function() {
            var args;
            args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
            return ViewModel.delay(bindArg.getVmValue(bindArg.elementBind.throttle), bindId, function() {
              return setter.apply(null, args);
            });
          };
        } else {
          return setter;
        }
      };
  
      ViewModel.getBindArgument = function(templateInstance, element, bindName, bindValue, bindObject, viewmodel, bindId, view) {
        var bindArg;
        bindArg = {
          templateInstance: templateInstance,
          autorun: function(f) {
            var fun;
            fun = function(c) {
              return f(bindArg, c);
            };
            templateInstance.autorun(fun);
          },
          element: element,
          elementBind: bindObject,
          getVmValue: ViewModel.getVmValueGetter(viewmodel, bindValue, view),
          bindName: bindName,
          bindValue: bindValue,
          viewmodel: viewmodel
        };
        bindArg.setVmValue = getDelayedSetter(bindArg, ViewModel.getVmValueSetter(viewmodel, bindValue, view), bindId);
        return bindArg;
      };
  
      ViewModel.bindSingle = function(templateInstance, element, bindName, bindValue, bindObject, viewmodel, bindings, bindId, view) {
        var bindArg, binding, eventFunc, eventName, fn1, ref1;
        bindArg = ViewModel.getBindArgument(templateInstance, element, bindName, bindValue, bindObject, viewmodel, bindId, view);
        binding = ViewModel.getBinding(bindName, bindArg, bindings);
        if (!binding) {
          return;
        }
        if (binding.bind) {
          binding.bind(bindArg);
        }
        if (binding.autorun) {
          bindArg.autorun(binding.autorun);
        }
        if (binding.events) {
          ref1 = binding.events;
          fn1 = function(eventName, eventFunc) {
            return element.bind(eventName, function(e) {
              return eventFunc(bindArg, e);
            });
          };
          for (eventName in ref1) {
            eventFunc = ref1[eventName];
            fn1(eventName, eventFunc);
          }
        }
      };
  
      stringRegex = /^(?:"(?:[^"]|\\")*[^\\]"|'(?:[^']|\\')*[^\\]')$/;
  
      quoted = function(str) {
        return stringRegex.test(str);
      };
  
      removeQuotes = function(str) {
        return str.substr(1, str.length - 2);
      };
  
      isPrimitive = function(val) {
        return val === "true" || val === "false" || val === "null" || val === "undefined" || $.isNumeric(val);
      };
  
      getPrimitive = function(val) {
        switch (val) {
          case "true":
            return true;
          case "false":
            return false;
          case "null":
            return null;
          case "undefined":
            return void 0;
          default:
            if ($.isNumeric(val)) {
              return parseFloat(val);
            } else {
              return val;
            }
        }
      };
  
      tokens = {
        '**': function(a, b) {
          return Math.pow(a, b);
        },
        '*': function(a, b) {
          return a * b;
        },
        '/': function(a, b) {
          return a / b;
        },
        '%': function(a, b) {
          return a % b;
        },
        '+': function(a, b) {
          return a + b;
        },
        '-': function(a, b) {
          return a - b;
        },
        '<': function(a, b) {
          return a < b;
        },
        '<=': function(a, b) {
          return a <= b;
        },
        '>': function(a, b) {
          return a > b;
        },
        '>=': function(a, b) {
          return a >= b;
        },
        '==': function(a, b) {
          return a == b;
        },
        '!==': function(a, b) {
          return a !== b;
        },
        '===': function(a, b) {
          return a === b;
        },
        '!===': function(a, b) {
          return a !== b;
        },
        '&&': function(a, b) {
          return a && b;
        },
        '||': function(a, b) {
          return a || b;
        }
      };
  
      tokenGroup = {};
  
      for (_t in tokens) {
        if (!tokenGroup[_t.length]) {
          tokenGroup[_t.length] = {};
        }
        tokenGroup[_t.length][_t] = 1;
      }
  
      dotRegex = /(\D\.)|(\.\D)/;
  
      firstToken = function(str) {
        var c, candidateToken, i, inQuote, j, k, len, length, parensCount, token, tokenIndex;
        tokenIndex = -1;
        token = null;
        inQuote = null;
        parensCount = 0;
        for (i = j = 0, len = str.length; j < len; i = ++j) {
          c = str[i];
          if (token) {
            break;
          }
          if (c === '"' || c === "'") {
            if (inQuote === c) {
              inQuote = null;
            } else if (!inQuote) {
              inQuote = c;
            }
          } else if (!inQuote && (c === '(' || c === ')')) {
            if (c === '(') {
              parensCount++;
            }
            if (c === ')') {
              parensCount--;
            }
          } else if (!inQuote && parensCount === 0 && ~"+-*/%&|><=".indexOf(c)) {
            tokenIndex = i;
            for (length = k = 4; k >= 1; length = --k) {
              if (str.length > tokenIndex + length) {
                candidateToken = str.substr(tokenIndex, length);
                if (tokenGroup[length] && tokenGroup[length][candidateToken]) {
                  token = candidateToken;
                  break;
                }
              }
            }
          }
        }
        return [token, tokenIndex];
      };
  
      getMatchingParenIndex = function(bindValue, parenIndexStart) {
        var currentChar, i, j, openParenCount, ref1, ref2;
        if (!~parenIndexStart) {
          return -1;
        }
        openParenCount = 0;
        for (i = j = ref1 = parenIndexStart + 1, ref2 = bindValue.length; ref1 <= ref2 ? j <= ref2 : j >= ref2; i = ref1 <= ref2 ? ++j : --j) {
          currentChar = bindValue.charAt(i);
          if (currentChar === ')') {
            if (openParenCount === 0) {
              return i;
            } else {
              openParenCount--;
            }
          } else if (currentChar === '(') {
            openParenCount++;
          }
        }
        throw new Error("Unbalanced parenthesis");
      };
  
      currentView = null;
  
      currentContext = function() {
        var ref1;
        if (currentView) {
          return Blaze.getData(currentView);
        } else {
          return (ref1 = Template.instance()) != null ? ref1.data : void 0;
        }
      };
  
      getValue = function(container, bindValue, viewmodel, funPropReserved, event) {
        var arg, args, breakOnFirstDot, dotIndex, errorMsg, j, left, len, name, neg, negate, newArg, newBindValue, newBindValueCheck, newContainer, parenIndexEnd, parenIndexStart, parsed, primitive, ref1, ref2, right, second, templateName, token, tokenIndex, value;
        bindValue = bindValue.trim();
        if (isPrimitive(bindValue)) {
          return getPrimitive(bindValue);
        }
        ref1 = firstToken(bindValue), token = ref1[0], tokenIndex = ref1[1];
        if (~tokenIndex) {
          left = getValue(container, bindValue.substring(0, tokenIndex), viewmodel);
          if ((token === '&&' && !left) || (token === '||' && left)) {
            value = left;
          } else {
            right = getValue(container, bindValue.substring(tokenIndex + token.length), viewmodel);
            value = tokens[token.trim()](left, right);
          }
        } else if (bindValue === "this") {
          value = currentContext();
        } else if (quoted(bindValue)) {
          value = removeQuotes(bindValue);
        } else {
          negate = bindValue.charAt(0) === '!';
          if (negate) {
            bindValue = bindValue.substring(1);
          }
          dotIndex = bindValue.search(dotRegex);
          if (~dotIndex && bindValue.charAt(dotIndex) !== '.') {
            dotIndex += 1;
          }
          parenIndexStart = bindValue.indexOf('(');
          parenIndexEnd = getMatchingParenIndex(bindValue, parenIndexStart);
          breakOnFirstDot = ~dotIndex && (!~parenIndexStart || dotIndex < parenIndexStart || dotIndex === (parenIndexEnd + 1));
          if (breakOnFirstDot) {
            newBindValue = bindValue.substring(dotIndex + 1);
            newBindValueCheck = newBindValue.endsWith('()') ? newBindValue.substr(0, newBindValue.length - 2) : newBindValue;
            newContainer = getValue(container, bindValue.substring(0, dotIndex), viewmodel, ViewModel.funPropReserved[newBindValueCheck]);
            value = getValue(newContainer, newBindValue, viewmodel);
          } else {
            if (container == null) {
              value = void 0;
            } else {
              name = bindValue;
              args = [];
              if (~parenIndexStart) {
                parsed = ViewModel.parseBind(bindValue);
                name = Object.keys(parsed)[0];
                second = parsed[name];
                if (second.length > 2) {
                  ref2 = second.substr(1, second.length - 2).split(',');
                  for (j = 0, len = ref2.length; j < len; j++) {
                    arg = ref2[j];
                    arg = $.trim(arg);
                    newArg = void 0;
                    if (arg === "this") {
                      newArg = currentContext();
                    } else if (quoted(arg)) {
                      newArg = removeQuotes(arg);
                    } else {
                      neg = arg.charAt(0) === '!';
                      if (neg) {
                        arg = arg.substring(1);
                      }
                      arg = getValue(viewmodel, arg, viewmodel);
                      if (viewmodel && arg in viewmodel) {
                        newArg = getValue(viewmodel, arg, viewmodel);
                      } else {
                        newArg = arg;
                      }
                      if (neg) {
                        newArg = !newArg;
                      }
                    }
                    args.push(newArg);
                  }
                }
              }
              primitive = isPrimitive(name);
              if (container instanceof ViewModel && !primitive && !container[name]) {
                container[name] = ViewModel.makeReactiveProperty(void 0, viewmodel);
              }
              if (!primitive && !((container != null) && ((container[name] != null) || _.isObject(container)))) {
                errorMsg = "Can't access '" + name + "' of '" + container + "'.";
                if (viewmodel) {
                  templateName = ViewModel.templateName(viewmodel.templateInstance);
                  errorMsg += " This is for template '" + templateName + "'.";
                }
                throw new Error(errorMsg);
              } else if (primitive) {
                value = getPrimitive(name);
              } else if (!name in container) {
                return void 0;
              } else {
                if (!funPropReserved && _.isFunction(container[name])) {
                  if (event) {
                    args.push(event);
                  }
                  value = container[name].apply(container, args);
                } else {
                  value = container[name];
                }
              }
            }
          }
          if (negate) {
            value = !value;
          }
        }
        return value;
      };
  
      ViewModel.getVmValueGetter = function(viewmodel, bindValue, view) {
        return function(optBindValue) {
          if (optBindValue == null) {
            optBindValue = bindValue;
          }
          currentView = view;
          return getValue(viewmodel, optBindValue.toString(), viewmodel);
        };
      };
  
      setValue = function(value, container, bindValue, viewmodel, event, initialProp) {
        var i, initProp, left, newBindValue, newContainer, ref1, retValue, right, token, tokenIndex;
        bindValue = bindValue.trim();
        if (isPrimitive(bindValue)) {
          return getPrimitive(bindValue);
        }
        ref1 = firstToken(bindValue), token = ref1[0], tokenIndex = ref1[1];
        retValue = void 0;
        if (~tokenIndex) {
          left = setValue(value, container, bindValue.substring(0, tokenIndex), viewmodel);
          if (token === '&&' && !left) {
            return left;
          }
          if (token === '||' && left) {
            return left;
          }
          right = setValue(value, container, bindValue.substring(tokenIndex + token.length), viewmodel);
          retValue = tokens[token.trim()](left, right);
        } else if (~bindValue.indexOf(')', bindValue.length - 1)) {
          retValue = getValue(viewmodel, bindValue, viewmodel, void 0, event);
        } else if (dotRegex.test(bindValue)) {
          i = bindValue.search(dotRegex);
          if (bindValue.charAt(i) !== '.') {
            i += 1;
          }
          newContainer = getValue(container, bindValue.substring(0, i), viewmodel, void 0);
          newBindValue = bindValue.substring(i + 1);
          initProp = initialProp || container[bindValue.substring(0, i)];
          retValue = setValue(value, newContainer, newBindValue, viewmodel, void 0, initProp);
        } else {
          if (_.isFunction(container[bindValue])) {
            retValue = container[bindValue](value);
          } else {
            container[bindValue] = value;
            if (initialProp && initialProp.changed) {
              initialProp.changed();
            }
            retValue = value;
          }
        }
        return retValue;
      };
  
      ViewModel.getVmValueSetter = function(viewmodel, bindValue, view) {
        if (!_.isString(bindValue)) {
          return (function() {});
        }
        return function(value) {
          currentView = view;
          return setValue(value, viewmodel, bindValue, viewmodel, value);
        };
      };
  
      ViewModel.parentTemplate = function(templateInstance) {
        var ref1, view;
        view = (ref1 = templateInstance.view) != null ? ref1.parentView : void 0;
        while (view) {
          if (view.name.substring(0, 9) === 'Template.' || view.name === 'body') {
            return view.templateInstance();
          }
          view = view.parentView;
        }
      };
  
      ViewModel.assignChild = function(viewmodel) {
        var ref1;
        if ((ref1 = viewmodel.parent()) != null) {
          ref1.children().push(viewmodel);
        }
      };
  
      ViewModel.onRendered = function() {
        return function() {
          var initial, templateInstance, viewmodel;
          templateInstance = this;
          viewmodel = templateInstance.viewmodel;
          initial = viewmodel.vmInitial;
          ViewModel.check("@onRendered", initial.autorun, templateInstance);
          ViewModel.delay(0, function() {
            var autorun, fn1, fun, j, k, len, len1, ref1, ref2;
            if (templateInstance.isDestroyed) {
              return;
            }
            ref1 = viewmodel.vmOnRendered;
            for (j = 0, len = ref1.length; j < len; j++) {
              fun = ref1[j];
              fun.call(viewmodel, templateInstance);
            }
            ref2 = viewmodel.vmAutorun;
            fn1 = function(autorun) {
              fun = function(c) {
                return autorun.call(viewmodel, c);
              };
              return templateInstance.autorun(fun);
            };
            for (k = 0, len1 = ref2.length; k < len1; k++) {
              autorun = ref2[k];
              fn1(autorun);
            }
          });
        };
      };
  
      ViewModel.loadProperties = function(toLoad, container) {
        var j, len, loadObj, obj;
        loadObj = function(obj) {
          var key, value;
          for (key in obj) {
            value = obj[key];
            if (!ViewModel.properties[key]) {
              if (ViewModel.reserved[key]) {
                throw new Error("Can't use reserved word '" + key + "' as a view model property.");
              } else {
                if (_.isFunction(value)) {
                  container[key] = value;
                } else if (container[key] && container[key].vmProp && _.isFunction(container[key])) {
                  container[key](value);
                } else {
                  container[key] = ViewModel.makeReactiveProperty(value, container);
                }
              }
            }
          }
        };
        if (isArray(toLoad)) {
          for (j = 0, len = toLoad.length; j < len; j++) {
            obj = toLoad[j];
            loadObj(obj);
          }
        } else {
          loadObj(toLoad);
        }
      };
  
      ViewModel.prototype.bind = function(bindObject, templateInstance, element, bindings, bindId, view) {
        var bindName, bindNameSingle, bindValue, j, len, ref1, viewmodel;
        viewmodel = this;
        for (bindName in bindObject) {
          bindValue = bindObject[bindName];
          if (!ViewModel.nonBindings[bindName]) {
            if (~bindName.indexOf(' ')) {
              ref1 = bindName.split(' ');
              for (j = 0, len = ref1.length; j < len; j++) {
                bindNameSingle = ref1[j];
                ViewModel.bindSingle(templateInstance, element, bindNameSingle, bindValue, bindObject, viewmodel, bindings, bindId, view);
              }
            } else {
              ViewModel.bindSingle(templateInstance, element, bindName, bindValue, bindObject, viewmodel, bindings, bindId, view);
            }
          }
        }
      };
  
      loadMixinShare = function(toLoad, collection, viewmodel, onlyEvents) {
        var container, element, item, j, k, len, len1, mixshare, ref;
        if (toLoad) {
          if (isArray(toLoad)) {
            for (j = 0, len = toLoad.length; j < len; j++) {
              element = toLoad[j];
              if (_.isString(element)) {
                loadToContainer(viewmodel, viewmodel, collection[element], onlyEvents);
              } else {
                loadMixinShare(element, collection, viewmodel, onlyEvents);
              }
            }
          } else if (_.isString(toLoad)) {
            loadToContainer(viewmodel, viewmodel, collection[toLoad], onlyEvents);
          } else {
            for (ref in toLoad) {
              container = {};
              mixshare = toLoad[ref];
              if (isArray(mixshare)) {
                for (k = 0, len1 = mixshare.length; k < len1; k++) {
                  item = mixshare[k];
                  loadToContainer(container, viewmodel, collection[item], onlyEvents);
                }
              } else {
                loadToContainer(container, viewmodel, collection[mixshare], onlyEvents);
              }
              viewmodel[ref] = container;
            }
          }
        }
      };
  
      loadToContainer = function(container, viewmodel, toLoad, onlyEvents) {
        var hook, hooks, item, j, k, len, len1, results, signal, signals, vmProp;
        if (!toLoad) {
          return;
        }
        if (isArray(toLoad)) {
          for (j = 0, len = toLoad.length; j < len; j++) {
            item = toLoad[j];
            loadToContainer(container, viewmodel, item, onlyEvents);
          }
        }
        if (!onlyEvents) {
          signals = ViewModel.signalToLoad(toLoad.signal, container);
          for (k = 0, len1 = signals.length; k < len1; k++) {
            signal = signals[k];
            loadToContainer(container, viewmodel, signal, onlyEvents);
            viewmodel.vmOnCreated.push(signal.onCreated);
            viewmodel.vmOnDestroyed.push(signal.onDestroyed);
          }
        }
        loadMixinShare(toLoad.share, ViewModel.shared, container, onlyEvents);
        loadMixinShare(toLoad.mixin, ViewModel.mixins, container, onlyEvents);
        loadToContainer(container, viewmodel, toLoad.load, onlyEvents);
        if (!onlyEvents) {
          ViewModel.loadProperties(toLoad, container);
        }
        if (onlyEvents) {
          hooks = {
            events: 'vmEvents'
          };
        } else {
          hooks = {
            onCreated: 'vmOnCreated',
            onRendered: 'vmOnRendered',
            onDestroyed: 'vmOnDestroyed',
            autorun: 'vmAutorun'
          };
        }
        results = [];
        for (hook in hooks) {
          vmProp = hooks[hook];
          if (toLoad[hook]) {
            if (isArray(toLoad[hook])) {
              results.push((function() {
                var l, len2, ref1, results1;
                ref1 = toLoad[hook];
                results1 = [];
                for (l = 0, len2 = ref1.length; l < len2; l++) {
                  item = ref1[l];
                  results1.push(viewmodel[vmProp].push(item));
                }
                return results1;
              })());
            } else {
              results.push(viewmodel[vmProp].push(toLoad[hook]));
            }
          }
        }
        return results;
      };
  
      ViewModel.prototype.load = function(toLoad, onlyEvents) {
        return loadToContainer(this, this, toLoad, onlyEvents);
      };
  
      ViewModel.prototype.parent = function() {
        var args, instance, parentTemplate, viewmodel;
        args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
        ViewModel.check.apply(ViewModel, ["#parent"].concat(slice.call(args)));
        viewmodel = this;
        instance = viewmodel.templateInstance;
        while (parentTemplate = ViewModel.parentTemplate(instance)) {
          if (parentTemplate.viewmodel) {
            return parentTemplate.viewmodel;
          } else {
            instance = parentTemplate;
          }
        }
      };
  
      ViewModel.prototype.reset = function() {
        var prop, ref1, results, viewmodel;
        viewmodel = this;
        results = [];
        for (prop in viewmodel) {
          if (_.isFunction((ref1 = viewmodel[prop]) != null ? ref1.reset : void 0)) {
            results.push(viewmodel[prop].reset());
          }
        }
        return results;
      };
  
      ViewModel.prototype.data = function(fields) {
        var js, prop, ref1, value, viewmodel;
        if (fields == null) {
          fields = [];
        }
        viewmodel = this;
        js = {};
        for (prop in viewmodel) {
          if (!(((ref1 = viewmodel[prop]) != null ? ref1.vmProp : void 0) && (fields.length === 0 || indexOf.call(fields, prop) >= 0))) {
            continue;
          }
          viewmodel[prop].depend();
          value = viewmodel[prop].value;
          if (value instanceof Array) {
            js[prop] = value.array();
          } else {
            js[prop] = value;
          }
        }
        return js;
      };
  
      ViewModel.prototype.valid = function(fields) {
        var prop, ref1, viewmodel;
        if (fields == null) {
          fields = [];
        }
        viewmodel = this;
        for (prop in viewmodel) {
          if (((ref1 = viewmodel[prop]) != null ? ref1.vmProp : void 0) && (fields.length === 0 || indexOf.call(fields, prop) >= 0)) {
            if (!viewmodel[prop].valid(true)) {
              return false;
            }
          }
        }
        return true;
      };
  
      ViewModel.prototype.validMessages = function(fields) {
        var message, messages, prop, ref1, viewmodel;
        if (fields == null) {
          fields = [];
        }
        viewmodel = this;
        messages = [];
        for (prop in viewmodel) {
          if (((ref1 = viewmodel[prop]) != null ? ref1.vmProp : void 0) && (fields.length === 0 || indexOf.call(fields, prop) >= 0)) {
            if (viewmodel[prop].valid(true)) {
              message = viewmodel[prop].message();
              if (message) {
                messages.push(message);
              }
            }
          }
        }
        return messages;
      };
  
      ViewModel.prototype.invalid = function(fields) {
        if (fields == null) {
          fields = [];
        }
        return !this.valid(fields);
      };
  
      ViewModel.prototype.invalidMessages = function(fields) {
        var message, messages, prop, ref1, viewmodel;
        if (fields == null) {
          fields = [];
        }
        viewmodel = this;
        messages = [];
        for (prop in viewmodel) {
          if (((ref1 = viewmodel[prop]) != null ? ref1.vmProp : void 0) && (fields.length === 0 || indexOf.call(fields, prop) >= 0)) {
            if (!viewmodel[prop].valid(true)) {
              message = viewmodel[prop].message();
              if (message) {
                messages.push(message);
              }
            }
          }
        }
        return messages;
      };
  
      ViewModel.prototype.templateName = function() {
        return ViewModel.templateName(this.templateInstance);
      };
  
      childrenProperty = function() {
        var array, funProp;
        array = new ReactiveArray();
        funProp = function(search, predicate) {
          var first, newPredicate;
          array.depend();
          if (arguments.length) {
            ViewModel.check("#children", search);
            newPredicate = void 0;
            if (_.isString(search)) {
              first = function(vm) {
                return ViewModel.templateName(vm.templateInstance) === search;
              };
              if (predicate) {
                newPredicate = function(vm) {
                  return first(vm) && predicate(vm);
                };
              } else {
                newPredicate = first;
              }
            } else {
              newPredicate = search;
            }
            return _.filter(array, newPredicate);
          } else {
            return array;
          }
        };
        return funProp;
      };
  
      ViewModel.getPathTo = function(element) {
        var i, ix, sibling, siblings;
        if (!element || !element.parentNode || element.tagName === 'HTML' || element === document.body) {
          return '/';
        }
        ix = 0;
        siblings = element.parentNode.childNodes;
        i = 0;
        while (i < siblings.length) {
          sibling = siblings[i];
          if (sibling === element) {
            return ViewModel.getPathTo(element.parentNode) + '/' + element.tagName + '[' + (ix + 1) + ']';
          }
          if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
          }
          i++;
        }
      };
  
      function ViewModel(initial) {
        var viewmodel;
        ViewModel.check("#constructor", initial);
        viewmodel = this;
        viewmodel.vmId = ViewModel.nextId();
        this.vmOnCreated = [];
        this.vmOnRendered = [];
        this.vmOnDestroyed = [];
        this.vmAutorun = [];
        this.vmEvents = [];
        viewmodel.load(initial);
        this.children = childrenProperty();
        viewmodel.vmPathToParent = function() {
          var difference, i, parentPath, viewmodelPath;
          viewmodelPath = ViewModel.getPathTo(viewmodel.templateInstance.firstNode);
          if (!viewmodel.parent()) {
            return viewmodelPath;
          }
          parentPath = ViewModel.getPathTo(viewmodel.parent().templateInstance.firstNode);
          i = 0;
          while (parentPath[i] === viewmodelPath[i] && (parentPath[i] != null)) {
            i++;
          }
          difference = viewmodelPath.substr(i);
          return difference;
        };
        return;
      }
  
      ViewModel.prototype.child = function() {
        var args, children;
        args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
        children = this.children.apply(this, args);
        if (children != null ? children.length : void 0) {
          return children[0];
        } else {
          return void 0;
        }
      };
  
      ViewModel.onDestroyed = function(initial) {
        return function() {
          var child, children, fun, indexToRemove, j, k, len, len1, parent, ref1, templateInstance, viewmodel;
          templateInstance = this;
          if (_.isFunction(initial)) {
            initial = initial(templateInstance.data);
          }
          viewmodel = templateInstance.viewmodel;
          ref1 = viewmodel.vmOnDestroyed;
          for (j = 0, len = ref1.length; j < len; j++) {
            fun = ref1[j];
            fun.call(viewmodel, templateInstance);
          }
          parent = viewmodel.parent();
          if (parent) {
            children = parent.children();
            indexToRemove = -1;
            for (k = 0, len1 = children.length; k < len1; k++) {
              child = children[k];
              indexToRemove++;
              if (child.vmId === viewmodel.vmId) {
                children.splice(indexToRemove, 1);
                break;
              }
            }
          }
          ViewModel.remove(viewmodel);
        };
      };
  
      ViewModel.templateName = function(templateInstance) {
        var name, ref1;
        name = templateInstance != null ? (ref1 = templateInstance.view) != null ? ref1.name : void 0 : void 0;
        if (!name) {
          return '';
        }
        if (name === 'body') {
          return name;
        } else {
          return name.substr(name.indexOf('.') + 1);
        }
      };
  
      ViewModel.prototype.vmHash = function() {
        var key, viewmodel;
        viewmodel = this;
        key = ViewModel.templateName(viewmodel.templateInstance);
        if (viewmodel.parent()) {
          key += viewmodel.parent().vmHash();
        }
        if (viewmodel.vmTag) {
          key += viewmodel.vmTag();
        } else if (viewmodel._id) {
          key += viewmodel._id();
        } else {
          key += viewmodel.vmPathToParent();
        }
        return SHA256(key).toString();
      };
  
      ViewModel.removeMigration = function(viewmodel, vmHash) {
        return Migration["delete"](vmHash);
      };
  
      ViewModel.shared = {};
  
      ViewModel.share = function(obj) {
        var content, key, prop, value;
        for (key in obj) {
          value = obj[key];
          ViewModel.shared[key] = {};
          for (prop in value) {
            content = value[prop];
            if (_.isFunction(content) || ViewModel.properties[prop]) {
              ViewModel.shared[key][prop] = content;
            } else {
              ViewModel.shared[key][prop] = ViewModel.makeReactiveProperty(content);
            }
          }
        }
      };
  
      ViewModel.globals = [];
  
      ViewModel.global = function(obj) {
        return ViewModel.globals.push(obj);
      };
  
      ViewModel.mixins = {};
  
      ViewModel.mixin = function(obj) {
        var key, value;
        for (key in obj) {
          value = obj[key];
          ViewModel.mixins[key] = value;
        }
      };
  
      ViewModel.signals = {};
  
      ViewModel.signal = function(obj) {
        var key, value;
        for (key in obj) {
          value = obj[key];
          ViewModel.signals[key] = value;
        }
      };
  
      signalContainer = function(containerName, container) {
        var all, fn1, key, signalObject, value;
        all = [];
        if (!containerName) {
          return all;
        }
        signalObject = ViewModel.signals[containerName];
        fn1 = function(key, value) {
          var boundProp, single, transform;
          single = {};
          single[key] = {};
          transform = value.transform || function(e) {
            return e;
          };
          boundProp = "_" + key + "_Bound";
          single.onCreated = function() {
            var func, funcToUse, vmProp;
            vmProp = container[key];
            func = function(e) {
              return vmProp(transform(e));
            };
            funcToUse = value.throttle ? _.throttle(func, value.throttle) : func;
            container[boundProp] = funcToUse;
            return value.target.addEventListener(value.event, funcToUse);
          };
          single.onDestroyed = function() {
            return value.target.removeEventListener(value.event, this[boundProp]);
          };
          return all.push(single);
        };
        for (key in signalObject) {
          value = signalObject[key];
          fn1(key, value);
        }
        return all;
      };
  
      ViewModel.signalToLoad = function(containerName, container) {
        var name;
        if (isArray(containerName)) {
          return _.flatten((function() {
            var j, len, results;
            results = [];
            for (j = 0, len = containerName.length; j < len; j++) {
              name = containerName[j];
              results.push(signalContainer(name, container));
            }
            return results;
          })(), true);
        } else {
          return signalContainer(containerName, container);
        }
      };
  
      return ViewModel;
  
    })();
  
  }).call(this);