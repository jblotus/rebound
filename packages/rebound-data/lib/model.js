import propertyCompiler from "property-compiler/property-compiler";
import $ from "rebound-runtime/utils";

// If Rebound Runtime has already been run, throw error
if(Rebound.Model){ throw 'Rebound Model is already loaded on the page!'; }
// If Backbone hasn't been started yet, throw error
if(!window.Backbone){ throw "Backbone must be on the page for Rebound to load."; }

function pathGenerator(parent, key){
  return function(){
    var path = parent.__path();
    return path + ((path === '') ? '' : '.') + key;
  };
}

// TODO: I dont like this recursively setting elements root when one element's root changes. Fix this.
function setRoot(obj, root){
  obj.__root__ = root;
  _.each(((obj.isCollection) ? obj.models : obj.attributes), function(value, key){
    if(value.isData){
      setRoot(value, root);
    }
  });
}

function cloneComputedProperty(prop, name){
  prop = prop.originalFunction || prop;
  prop = (prop.__params) ? prop : propertyCompiler.compile(prop, name);
  var func = function(){
    return prop.apply(this, arguments);
  };
  func.__params = prop.__params;
  func.originalFunction = prop;
  func.isComputedProperty = true;
  return func;
}

function evaluateComputedProperty(computedProperty, context, path){
  var data, result, lineage;
  result = data = computedProperty.call(context);

  // if(_.isUndefined(result) || _.isNull(result)){ return result; }

  // Save this object's ancestary
  lineage = {
    __parent__: context,
    __root__: context.__root__,
    __path: pathGenerator(context, path),
    _hasAncestry: true
  };

  if(_.isArray(result)){
    result = new (Rebound.Collection.extend(lineage))();
    result.models = data;
  }
  else if(_.isObject(result) && result && !result.isModel && !result.isCollection){
    lineage.defaults = data;
    result = new (Rebound.Model.extend(lineage))();
  }
  else if(result && result.isModel || result && result.isCollection){
    _.defaults(result, lineage);
  }

  return result;

}

var Model = Backbone.Model.extend({

  isModel: true,
  isData: true,

  __path: function(){ return ''; },

  initialize: function(){
    this.__parent__ = this.__parent__ || this;
    this.__root__ =  this.__root__ || this;
    this.helpers = {};
  },

  hasParent: function(obj){
    var tmp = this;
    while(tmp !== obj){
      tmp = tmp.__parent__;
      if(_.isUndefined(tmp)){ return false; }
      if(tmp === obj){ return true; }
      if(tmp.__parent__ === tmp){ return false; }
    }
    return true;
  },

  get: function(key, options){

    // Split the path at all '.', '[' and ']' and find the value referanced.
    var parts  = $.splitPath(key),
        result = this,
        l=parts.length,
        i=0;
        options = _.defaults((options || {}), { parent: 0, raw: false });

    if(_.isUndefined(key) || _.isNull(key)){ return key; }

    if(key === '' || parts.length === 0){ return result; }

    if (parts.length > 0) {
      for ( i = 0; i < l - options.parent; i++) {

        if( _.isFunction(result )){
          // If returning raw, always return the first computed property in a chian.
          if(options.raw){ return result; }
          result = evaluateComputedProperty(result, result.__parent__, parts[i-1]);
        }

        if(_.isUndefined(result) || _.isNull(result)){
          return result;
        }

        if(parts[i] === '@parent'){
          result = result.__parent__;
        }
        else if( result.isCollection ){
          result = result.models[parts[i]];
        }
        else if( result.isModel ){
          result = result.attributes[parts[i]];
        }
        else if( result && result.hasOwnProperty(parts[i]) ){
          result = result[parts[i]];
        }
      }
    }

    if( _.isFunction(result) && !options.raw){

      result = evaluateComputedProperty(result, this, parts[i-1]);

    }

    return result;
  },

  // TODO: Moving the head of a data tree should preserve ancestry
  set: function(key, val, options){
    var attrs, attr, newKey, obj, target, destination, isOriginalObject, props;

    // Set is able to take a object or a key value pair. Normalize this input.
    if (typeof key === 'object') {
      attrs = key;
      options = val;
    } else {
      (attrs = {})[key] = val;
    }

    if(_.isEmpty(attrs)){ return; }

    // For each key and value
    for (key in attrs) {

      val = attrs[key];                               // Our value
      attr  = $.splitPath(key).pop();                 // The key      ex: foo[0].bar --> bar
      target = this.get(key, {raw: true, parent: 1}); // The element  ex: foo.bar.baz --> foo.bar
      destination = target.get(attr) || {};           // The current value of attr
      isOriginalObject = false;                       // If this is the original object passed or a copy
      obj = undefined;                                // The new data object, we will be constructing this as we go.

      // If val is null, set to undefined
      if(val === null || val === undefined){
        val = undefined;
      }
      // If this value is a Model or Collection and is not an ancester in the data tree (circular dependancy)
      else if(val.isData){
        if(!this.hasParent(val) && val._hasAncestry){
          // Check if already has its ancestery set, but is not an ancester here
          // It is coming from a different data tree. Make a copy to prevent shared memory across data trees
          obj = new val.constructor();
          val = (val.isModel) ? val.attributes : val.models;
        }
        // Otherwise, is a fresh new object, set its ancestry
        else{
          obj = val;
          isOriginalObject = true;
        }
      }
      // If this value is a Computed Property, register it for compilation.
      else if(_.isFunction(val)){

        obj = cloneComputedProperty(val, key);

        // All comptued properties' dependancies are calculated and added to their __params attribute. Save these in the context's helper cache.
        this.__root__.helpers[this.cid] = this.__root__.helpers[this.cid] || {};
        this.__root__.helpers[this.cid][key] = obj;

      }
      // If this value is a vanilla object, and we aren't adding to an existing model, turn it into a model
      else if(_.isObject(val) && !_.isArray(val) && !destination.isModel){
        obj = new Rebound.Model();
      }
      // If this value is an array, and we aren't adding to an existing collection, turn it into a collection
      else if(_.isArray(val) && !destination.isCollection){
        obj = new Rebound.Collection();
      }

      // Given an object to modify, set ancestry
      if(!_.isUndefined(obj)){
        if( !obj._hasAncestry ){

          // Save this object's ancestry
          obj.__parent__ = this;
          setRoot(obj, this.__root__);
          obj.__path = pathGenerator(obj.__parent__, key);
          obj._hasAncestry = true;

          // If an eventable object, propagate its events up the chain
          if(obj.isData){
            obj.on('all', this.trigger, this);
          }

        }
        //  Set its values if this is not the original data object passed in
        if(obj.isData && !isOriginalObject){
          obj.set(val);
        }
        // Save our changes
        val = attrs[key] = obj;

        // This object is now a parent. Ensure that it knows it. Without this the root element will never have this bool set
        this._hasAncestry = true;
      }

      // If existing collection and is an vanilla array, add the models
      if( destination.isCollection && (!val.isData || _.isArray(val))){
        destination.set(((val.isCollection) ? val.models : val), options);
      }
      // If existing model and is a vanilla object, augment it
      else if(destination.isModel && !val.isData && _.isObject(val) && !_.isArray(val) ){
        destination.set(val, options);
      }
      // Otherwise, replace the existing value
      else{
        // TODO: Event cleanup when replacing a model or collection with another value
        Backbone.Model.prototype.set.call(target, attr, val, options);
      }
    }
  },

  toJSON: function() {
      if (this._isSerializing) {
          return this.id || this.cid;
      }
      this._isSerializing = true;
      var json = _.clone(this.attributes);
      _.each(json, function(value, name) {
          if( _.isNull(value) || _.isUndefined(value) ){ return; }
          _.isFunction(value.toJSON) && (json[name] = value.toJSON());
      });
      this._isSerializing = false;
      return json;
  }

});

export default Model;