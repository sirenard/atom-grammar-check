'use babel';

import {CompositeDisposable} from 'atom';

const GrammarChecker = require('./grammarChecker');


module.exports = {
    activate() {
        // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
        this.subscriptions = new CompositeDisposable();
        this.count = 0;

        this.grammarChecker = [];//only one checker for the activate text editor

        this.contextMenuEntries = [];

        this.subscriptions.add(atom.workspace.onDidAddTextEditor((event) => {
                let editor = event.textEditor;
                this.load_new_grammar_checker(editor);
            }
        ));

        // /!\ Stolen from spell-check
        // Hook up changes to the configuration settings.
        this.excludedScopeRegexLists = [];
        this.subscriptions.add(
            atom.config.observe(
                'grammar-check.excludedScopes',
                (excludedScopes) => {
                    this.excludedScopeRegexLists = excludedScopes.map(
                        (excludedScope) =>
                            excludedScope
                                .split(/\s+/)[0]
                                .split('.')
                                .filter((className) => className)
                                .map(
                                    (className) =>
                                        new RegExp(`\\b${className}\\b`)
                                )
                    );
                    for(el of this.grammarChecker){
                        el.correct_all();
                    }
                    //return this.updateViews();
                }
            )
        );

        for (editor of atom.workspace.getTextEditors()) {//create a grammarChecker for every opened editor
            this.load_new_grammar_checker(editor);
        }

    },

    load_new_grammar_checker(editor) {
        /*if (this.grammarChecker){
          this.grammarChecker.destroy();
          this.grammarChecker = null;
        }*/

        if (editor == null) return;
        //this.grammarChecker = new GrammarChecker(editor);
        let new_grammar_checker = new GrammarChecker(editor, this, this.generateName());
        this.grammarChecker.push(new_grammar_checker);

        editor.onDidDestroy(() => { // in destroy, we remove the and destroy the grammarChecker
            let index = this.grammarChecker.indexOf(new_grammar_checker);
            if (index > -1) {
                this.grammarChecker[index].destroy();
                this.grammarChecker.splice(index, 1);
            }
            console.log("Removing index: ", index, ", remaining editor: " + this.grammarChecker.length);
        });
    },


    clearContextMenuEntries() {
        for (let entry of this.contextMenuEntries) {
            if (entry.command != null) {
                entry.command.dispose();
            }
            if (entry.menuItem != null) {
                entry.menuItem.dispose();
            }
        }

        return (this.contextMenuEntries = []);
    },

    generateName() {
        /**
         * Generate a unique name for grammarChecker
         */
        let name = "";
        let n = this.count++;

        //convert n into base 26 where the "digit" are the alphabet letters
        while (n || !name.length) {
            let rest = n % 26; // 26 letters in the alphabet
            name = String.fromCharCode(65 + n) + name;
            n = (n - rest) / 26;
        }
        return name;
    },

    scopeIsExcluded(scopeDescriptor) {
        // /!\ stolen from spell-chack
        return this.excludedScopeRegexLists.some((regexList) =>
            scopeDescriptor.scopes.some((scopeName) =>
                regexList.every((regex) => regex.test(scopeName))
            )
        );
    },

    deactivate() {
        this.subscriptions.dispose();
        for (checker of this.grammarChecker) {
            checker.destroy();
        }
        this.grammarChecker = [];
    },

    serialize() {
    }

};
