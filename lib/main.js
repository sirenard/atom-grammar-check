'use babel';

import { CompositeDisposable } from 'atom';
const GrammarChecker = require('./grammarChecker');


module.exports = {
  activate() {
    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    this.grammarChecker = [];//only one checker for the activate text editor

    for (editor of atom.workspace.getTextEditors()){//create a grammarChecker for every opened editor
      this.load_new_grammar_checker(editor);
    }

    this.subscriptions.add(atom.workspace.onDidAddTextEditor((event) =>{
      let editor = event.textEditor;
      this.load_new_grammar_checker(editor);
    }

    ));


  },

  load_new_grammar_checker(editor){
    /*if (this.grammarChecker){
      this.grammarChecker.destroy();
      this.grammarChecker = null;
    }*/

    if (editor==null)return;
    //this.grammarChecker = new GrammarChecker(editor);
    let new_grammar_checker = new GrammarChecker(editor);
    this.grammarChecker.push(new_grammar_checker);

    editor.onDidDestroy( () => { // in destroy, we remove the and destroy the grammarChecker
      let index = this.grammarChecker.indexOf(new_grammar_checker);
      if (index > -1) {
        this.grammarChecker[index].destroy();
        this.grammarChecker.splice(index, 1);
      }
      console.log("Removing index: ", index, ", remaining editor: " + this.grammarChecker.length);
    });
  },

  deactivate() {
    this.subscriptions.dispose();
    for(checker of this.grammarChecker){
      checker.destroy();
    }
    this.grammarChecker = [];
  },

  serialize() {
  }

};
