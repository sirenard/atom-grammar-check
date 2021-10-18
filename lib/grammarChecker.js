'use babel';

import {CompositeDisposable} from 'atom';
import {Point} from 'atom';
import {Range} from 'atom';
import {Mutex} from 'async-mutex';

module.exports = GrammarChecker = class GrammarChecker {
    constructor(editor, spellCheckModule, name) {
        this.editor = editor;
        this.spellCheckModule = spellCheckModule;
        this.name = name;
        this.markerCounter = 0;
        this.layer = this.editor.addMarkerLayer();
        this.correctionMutex = new Mutex();

        this.gingerbread = require('gingerbread');

        this.correctAll();

        this.subscriptions = new CompositeDisposable();
        this.subscriptions.add(editor.onDidStopChanging(() => {
                let range = this.editor.getCurrentParagraphBufferRange();
                if (range) {
                    this.correct(range);
                }
            }
        ));


        atom.views.getView(this.editor).addEventListener('contextmenu', (mouseEvent) => this.addContextMenuEntries(mouseEvent));
    }

    correctAll(){
        let last_line = this.editor.getLastBufferRow();
        this.correct(new Range(new Point(0, 0), new Point(last_line + 1, 0)));
    }

    async correct(range) {
        if (this.correctionMutex.isLocked()) {
            return;
        }
        const release = await this.correctionMutex.acquire();
        try {
            // highlight mistake in the range, unhighlight corriged mistakes
            //console.log("New corrections");
            let text = this.editor.getTextInBufferRange(range);
            if (text) {
                let general_raw_counter = range.start.row;
                for (line of text.split("\n")) {
                    let row_number = general_raw_counter++;
                    await this.gingerbread(line, (error, text, result, corrections) => {
                        let excluded_range = [];
                        for (correction of corrections) {
                            //console.log(correction);
                            let col_start = range.start.column + correction.start;
                            let col_end = col_start + correction.length
                            excluded_range.push([col_start, col_end]);

                            let new_range = new Range(new Point(row_number, col_start), new Point(row_number, col_end));

                            //console.log("New correction range: " + new_range);
                            //console.log(correction.text + " into " + correction.correct);


                            if (this.isValidScope(new_range)) {
                                this.updateMarker(new_range, correction.correct);
                            }
                        }
                        this.destroyMarkers(row_number, excluded_range, line.length);
                    });
                }
            }
        } finally {
            release();
        }
    }

    isValidScope(range){
        /**
         * return true if the first char and the last char of the range are in a valid scope
         */
        for (point of [range.start, new Point(range.end.row, range.end.column-1)]) {
            const scope = this.editor.scopeDescriptorForBufferPosition(point);
            //console.log(scope, this.spellCheckModule.scopeIsExcluded(scope));
            if (this.spellCheckModule.scopeIsExcluded(scope))return false;
        }
        return true;
    }

    updateMarker(range, solution) {
        /**
         * Update the marker if already exists or create a new one
         * solution is the proposed replacment string
         */

        let markers = this.layer.findMarkers({containsBufferRange: range});
        markers = markers.filter(marker => marker.getBufferRange().start !== range.end);//remove the joined markers

        let marker;
        if (!markers.length) { // if not already marked, create a marker
            marker = this.layer.markBufferRange(range);
            marker.setProperties({
                solution: "",
                id: this.markerCounter++
            });
            this.editor.decorateMarker(marker, {
                type: 'highlight',
                class: 'grammar-check-misspelling',
                deprecatedRegionClass: 'misspelling',
            });
        } else { // if already marked, we update his range
            marker = markers[0];
            marker.setBufferRange(range, {reversed: false});
        }


        if (solution) {
            marker.setProperties({solution: solution});
        }
    }

    destroyMarkers(rowNumber, excludedRange, finalColumnNumber) {
        /** Remove every markers that contain a "point" at line row number. If the marker is on a excludedRange, then it is'nt removed
         * rowNumber: Number
         * excludedRange [[a,b]] where the range a,b is to exclude. a & b are Number and represent column numbers
         *   the list must be ordonate
         * finalColumnNumber: last column number
         */
        let current = 0;
        let currentExcludedRange = 0;
        while (current <= finalColumnNumber) {
            if (currentExcludedRange < excludedRange.length && current >= excludedRange[currentExcludedRange][0]) {
                current = excludedRange[currentExcludedRange][1] + 1;
                ++currentExcludedRange;
            } else {
                let searching_range = new Range(new Point(rowNumber, current), new Point(rowNumber, current));
                for (marker of this.layer.findMarkers({"containsBufferRange": searching_range})) {
                    marker.destroy();
                }
                ++current;
            }
        }
    }

    addContextMenuEntries(mouseEvent) {
        // /!\ stolen from spell-check package
        let marker;


        this.spellCheckModule.clearContextMenuEntries();
        // Get buffer position of the right click event. If the click happens outside
        // the boundaries of any text, the method defaults to the buffer position of
        // the last character in the editor.
        const currentScreenPosition = atom.views
            .getView(this.editor)
            .component.screenPositionForMouseEvent(mouseEvent);
        const currentBufferPosition = this.editor.bufferPositionForScreenPosition(currentScreenPosition);

        // Check to see if the selected word is incorrect.
        if (
            (marker = this.layer.findMarkers({
                containsBufferPosition: currentBufferPosition,
            })[0])
        ) {
            const correction = marker.getProperties().solution;
            if (correction && correction.length > 0) {
                const contextMenuEntry = {};

                this.spellCheckModule.contextMenuEntries.push({
                    menuItem: atom.contextMenu.add({
                        'atom-text-editor': [{type: 'separator'}],
                    }),
                });

                var commandName ='grammar-check:correct-mistake-' + this.name + marker.getProperties().id;

                contextMenuEntry.command = ((
                    correction
                ) => {
                    return atom.commands.add(
                        atom.views.getView(this.editor),
                        commandName,
                        () => {
                            let range = marker.getBufferRange();
                            this.editor.setTextInBufferRange(range, correction);
                            marker.destroy();
                            return this.spellCheckModule.clearContextMenuEntries();
                        }
                    );
                })(correction, contextMenuEntry);

                // Add new menu item for correction.
                contextMenuEntry.menuItem = atom.contextMenu.add({
                    'atom-text-editor': [
                        { label: correction, command: commandName },
                    ],
                });
                this.spellCheckModule.contextMenuEntries.push(contextMenuEntry);

                return this.spellCheckModule.contextMenuEntries.push({
                    menuItem: atom.contextMenu.add({
                        'atom-text-editor': [{ type: 'separator' }],
                    }),
                });

            }
        }
    }

    destroy() {
        this.subscriptions.dispose();
        for (marker of this.layer.getMarkers()) {
            marker.destroy();
        }
        this.layer.destroy();
    }
}
