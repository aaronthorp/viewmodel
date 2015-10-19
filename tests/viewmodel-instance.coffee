describe "ViewModel instance", ->

  beforeEach ->
    @checkStub = sinon.stub ViewModel, "check"
    @viewmodel = new ViewModel()

  afterEach ->
    sinon.restoreAll()

  describe "constructor", ->
    it "adds property as function", ->
      vm = new ViewModel({ name: 'A'})
      assert.isFunction vm.name
      assert.equal 'A', vm.name()
      vm.name('B')
      assert.equal 'B', vm.name()

    it "doesn't convert functions", ->
      f = ->
      vm = new ViewModel
        fun: f
      assert.equal f, vm.fun

  describe "#bind", ->

    beforeEach ->
      @bindSingleStub = sinon.stub ViewModel, 'bindSingle'

    it "calls bindSingle for each entry in bindObject", ->
      bindObject =
        a: 1
        b: 2
      vm = {}
      bindings =
        a: 1
        b: 2
      @viewmodel.bind.call vm, bindObject, 'templateInstance', 'element', bindings
      assert.isTrue @bindSingleStub.calledTwice
      assert.isTrue @bindSingleStub.calledWith 'templateInstance', 'element', 'a', 1, bindObject, vm, bindings
      assert.isTrue @bindSingleStub.calledWith 'templateInstance', 'element', 'b', 2, bindObject, vm, bindings

    it "returns undefined", ->
      bindObject = {}
      ret = @viewmodel.bind bindObject, 'templateInstance', 'element', 'bindings'
      assert.isUndefined ret

  describe "#extend", ->

    it "adds a property to the view model", ->
      @viewmodel.extend({ name: 'Alan' })
      assert.equal 'Alan', @viewmodel.name()

    it "adds function to the view model", ->
      f = ->
      @viewmodel.extend({ fun: f })
      assert.equal f, @viewmodel.fun

    it "doesn't create a new property when extending the same name", ->
      @viewmodel.extend({ name: 'Alan' })
      old = @viewmodel.name
      @viewmodel.extend({ name: 'Brito' })
      assert.equal 'Brito', @viewmodel.name()
      assert.equal old, @viewmodel.name

    it "doesn't do anything with null and undefined", ->
      @viewmodel.extend(undefined )
      @viewmodel.extend(null)

  describe "#parent", ->

    it "has parent function", ->
      assert.isFunction @viewmodel.parent

    it "returns the view model of the parent template", ->
      @viewmodel.templateInstance =
        view:
          parentView:
            name: 'Template.A'
            templateInstance: ->
              viewmodel: "X"
      parent = @viewmodel.parent()
      assert.equal "X", parent

  describe "#children", ->

    beforeEach ->
      @viewmodel.children().push
        age: -> 1
        name: -> "AA"
        templateInstance:
          view:
            name: 'Template.A'
      @viewmodel.children().push
        age: -> 2
        name: -> "BB"
        templateInstance:
          view:
            name: 'Template.B'
      @viewmodel.children().push
        age: -> 1
        templateInstance:
          view:
            name: 'Template.A'

    it "returns all without arguments", ->
      assert.equal 3, @viewmodel.children().length
      @viewmodel.children().push("X")
      assert.equal 4, @viewmodel.children().length
      assert.equal "X", @viewmodel.children()[3]

    it "returns by template when passed a string", ->
      arr = @viewmodel.children('A')
      assert.equal 2, arr.length
      assert.equal 1, arr[0].age()
      assert.equal 1, arr[1].age()

    it "returns array from a predicate", ->
      arr = @viewmodel.children((vm) -> vm.age() is 2)
      assert.equal 1, arr.length
      assert.equal "BB", arr[0].name()

