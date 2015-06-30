getArgumentResult = (arg, data) ->
  if arg instanceof Function
    return arg(data)
  return arg

Blaze.Template.prototype.createViewModel = (data) ->
  template = this
  argCount = 0
  vmName = null
  vmObjects = []
  for arg in template.viewmodelArgs
    argCount++
    argResult = getArgumentResult(arg, data)
    if argCount is 1
      if Helper.isString argResult
        vmName = argResult
      else
        vmObjects.push argResult
    else if argCount is template.viewmodelArgs.length
      if not (Helper.isString(argResult) or argResult instanceof Array)
        vmObjects.push argResult
    else
      vmObjects.push argResult
  viewmodel = new ViewModel vmName, {}
  for obj in vmObjects when obj
    viewmodel.extend obj
    if obj.autorun
      Tracker.autorun (c) ->
        obj.autorun.call(viewmodel, c)
  viewmodel

Blaze.Template.prototype.viewmodel = ->
  template = this
  args = arguments
  template.viewmodelArgs = args
  argTotal = args.length
  vmHelpers = []
  lastArg = args[argTotal - 1]
  if Helper.isString lastArg
    vmHelpers.push lastArg
  else if lastArg instanceof Array
    for helper in lastArg
      vmHelpers.push helper

  for helperName in vmHelpers
    do (helperName) ->
      helper = {}
      helper[helperName] = ->
        Template.instance().viewmodel[helperName]()
      template.helpers helper

  created = false
  template.onCreated ->
    this.viewmodel = template.createViewModel(this.data)
    this.viewmodel.templateInstance = this;
    this.viewmodel._vm_addParent this.viewmodel, this
    if this.viewmodel.onCreated
      this.viewmodel.onCreated this

    if not created
      if this.viewmodel.blaze_helpers
        helpers = this.viewmodel.blaze_helpers
        template.helpers( if _.isFunction(helpers) then helpers() else helpers )

      if this.viewmodel.blaze_events
        events = this.viewmodel.blaze_events
        template.events( if _.isFunction(events) then events() else events )
    created = true

  template.onRendered ->
    if this.viewmodel.beforeBind
      this.viewmodel.beforeBind this

    if this.viewmodel.onRendered
      this.viewmodel.onRendered this

    this.viewmodel.bind this

    if this.viewmodel.afterBind
      this.viewmodel.afterBind this

  template.onDestroyed ->
    if this.viewmodel.onDestroyed
      this.viewmodel.onDestroyed this
    this.viewmodel.dispose()

htmls = { }
Blaze.Template.prototype.elementBind = (selector, data) ->
  name = this.viewName
  html = null
  if data
    html = $("<div></div>").append($(Blaze.toHTMLWithData(this, data)))
  else if htmls[name]
    html = htmls[name]
  else
    html = $("<div></div>").append($(Blaze.toHTML(this)))
    htmls[name] = html
  
  ViewModel.parseBind(html.find(selector).data("bind"))