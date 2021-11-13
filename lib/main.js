'use babel';

import {CompositeDisposable} from 'atom';
import {GrammarChecker} from "./grammarChecker"
import {correctLanguageTool, correctWithGinger} from './correcters'
import {exec} from "child_process";


class GrammarCheckerManager {
    constructor() {
        this.count = 0; //incremented at each new opened editors

    }

    async activate() {
        // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
        this.languageToolServerRunning = false;
        await this.startLanguageToolServer();

        this.subscriptions = new CompositeDisposable();

        this.grammarChecker = [];//list of current grammarChecker
        this.contextMenuEntries = [];

        this.subscriptions.add(atom.workspace.onDidAddTextEditor((event) => {
                let editor = event.textEditor;
                this.loadNewGrammarChecker(editor);
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
                    this.grammarChecker.map(c => c.correctAll());
                }
            )
        );

        // Hook up changes to the usedCorrecter settings.
        this.usedCorrecter;
        this.subscriptions.add(
            atom.config.observe('grammar-check.usedCorrecter', async (usedCorrecter) => {
                switch (usedCorrecter) {
                    case 'ginger':
                        this.usedCorrecter = correctWithGinger;
                        break;
                    case 'languagetool':
                        this.usedCorrecter = correctLanguageTool;
                        if(!this.languageToolServerRunning)await this.startLanguageToolServer();
                        break;
                    default:
                        break;
                }
                this.grammarChecker.map(c => {
                    c.correcter = this.usedCorrecter;
                    c.correctAll()
                });
            })
        );


        // Hook up changes to the pick language.
        this.correcterParams = {}
        this.subscriptions.add(
            atom.config.observe('grammar-check.language', (language) => {
                this.correcterParams.language = language;
                this.grammarChecker.map(c => {
                    c.correcterArgs = this.correcterParams;
                    c.correctAll()
                });
            })
        );

        // Hook up changes to the languagetool server
        this.subscriptions.add(
            atom.config.observe('grammar-check.languagetoolUrl', (languagetoolUrl) => {
                this.correcterParams.url = languagetoolUrl;
                this.grammarChecker.map(c => {
                    c.correcterArgs = this.correcterParams;
                    c.correctAll()
                });
            })
        );


        for (let editor of atom.workspace.getTextEditors()) {//create a grammarChecker for every opened editor
            this.loadNewGrammarChecker(editor);
        }

    }

    async startLanguageToolServer() {
        //try to start the server
        if(atom.config.get("grammar-check.usedCorrecter") === "languagetool") {
            //let exec = require('child_process').exec;
            let command = atom.config.get("grammar-check.languageToolStartServerCommand");
            if (command && command.length) {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.warn(`Error while starting language tool server: ${error} \nMaybe that the server already runs or the package is not well configured?`);
                    } else{
                        this.languageToolServerRunning = true;
                    }
                });
                await new Promise(r => setTimeout(r, 300));
            }
        }
    }

    loadNewGrammarChecker(editor) {
        if (editor == null) return;
        let newGrammarChecker = new GrammarChecker(editor, this, this.generateName(), this.usedCorrecter, this.correcterParams);
        this.grammarChecker.push(newGrammarChecker);

        editor.onDidDestroy(() => { // on destroy, we remove and destroy the grammarChecker
            let index = this.grammarChecker.indexOf(newGrammarChecker);
            if (index > -1) {
                this.grammarChecker[index].destroy();
                this.grammarChecker.splice(index, 1);
            }
        });
    }

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
    }

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
    }

    scopeIsExcluded(scopeDescriptor) {
        // /!\ stolen from spell-check
        return this.excludedScopeRegexLists.some((regexList) =>
            scopeDescriptor.scopes.some((scopeName) =>
                regexList.every((regex) => {
                    return regex.test(scopeName);
                })
            )
        );
    }

    deactivate() {
        this.subscriptions.dispose();
        for (checker of this.grammarChecker) {
            checker.destroy();
        }
        this.grammarChecker = [];
    }

    serialize() {
    }

}

module.exports = new GrammarCheckerManager();
