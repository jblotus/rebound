import Model from "rebound-data/model";
import Collection from "rebound-data/collection";
import $ from "rebound-runtime/utils";


/**
 * Deinitializes the current class and subclasses associated with it
 * Note: this functionality is common for all Backbone derived class
 *
 */
Model.prototype.deinitialize =
Collection.prototype.deinitialize = function () {

  // deinitialize current class

  // undelegate events..(events specified as part of event:{})
  if (this.undelegateEvents) {
    this.undelegateEvents();
  }

  // stop listening model events
  if (this.stopListening) {
    this.stopListening();
  }

  // unbind events
  if (this.off) {
    this.off();
  }

  // if data has a dom element associated with it, remove all dom events and the dom referance
  if(this.el){

    _.each(this.el.__listeners, function(handler, eventType){
      if (this.el.removeEventListener){ this.el.removeEventListener(eventType, handler, false); }
      if (this.el.detachEvent){ this.el.detachEvent('on'+eventType, handler); }
    }, this);

    // Remove all event delegates
    delete this.el.__listeners;
    delete this.el.__events;

    // Recursively remove element lazyvalues
    $(this.el).walkTheDOM(function(el){
      if(el.__lazyValue && el.__lazyValue.destroy()){
        n.__lazyValue.destroy();
      }
    });

    // Remove element referances
    delete this.$el;
    delete this.el;
  }

  // mark it as deinitialized
  this.deinitialized = true;
  // deinitialize subclasses
  if(this.data && this.data.deinitialize){
    this.data.deinitialize();
  }

  _.each(this.models, function (value, index) {
    if (value && value.deinitialize) {
      value.deinitialize();
    }
  });

  _.each(this.attributes, function (value, index) {
    if (value && value.deinitialize) {
      value.deinitialize();
    }
  });

  // clean up references
  this.__observers = {};
  // this.models = [];
  this.data = {};
  // this.attributes = {};

};

export { Model, Collection };