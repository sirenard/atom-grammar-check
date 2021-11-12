'use babel';

import {CompositeDisposable, Point, Range} from 'atom';
import {Mutex} from 'async-mutex';
import {correctLanguageTool, correctWithGinger} from './correcters'

export class GrammarChecker {
    constructor(editor, manager, name) {
        this.editor = editor;
        this.manager = manager;
        this.name = name;
        this.markerCounter = 0;
        this.layer = this.editor.addMarkerLayer();
        this.correctionMutex = new Mutex();

        this.correctAll();

        this.subscriptions = new CompositeDisposable();
        this.subscriptions.add(editor.onDidStopChanging(() => {
                let range = this.editor.getCurrentParagraphBufferRange();
                if (range) {
                    this.correct(range);
                }
            }
        ));

        atom.views.getView(this.editor).addEventListener('contextmenu',
            (mouseEvent) => this.addContextMenuEntries(mouseEvent)
        );
    }

    correctAll() {
        let last_line = this.editor.getLastBufferRow();
        this.correct(new Range(new Point(0, 0), new Point(last_line + 1, 0)));
    }

    async correct(range) {
        if (this.correctionMutex.isLocked()) {// if a correction is processing, abort
            return;
        }
        const release = await this.correctionMutex.acquire();
        try {
            // highlight mistakes in the range, unhighlight fixed mistakes
            //console.log("New corrections");
            let text = this.editor.getTextInBufferRange(range);

            if (text) {
                let general_raw_counter = range.start.row;
                let row_number = general_raw_counter++;
                //let corrections = await correctWithGinger(text);
                let corrections = await correctLanguageTool(text);

                let excluded_range = [];
                let buffer = 0;
                for (let i=0; i<corrections.length; ++i) {
                    let correction = corrections[i];
                    console.log(correction);

                    let firstNewLine = text.indexOf("\n", buffer);
                    while (firstNewLine !== -1 && firstNewLine < correction.start) {
                        buffer = firstNewLine + 1;
                        ++row_number;
                        firstNewLine = text.indexOf("\n", buffer);
                    }

                    let col_start = correction.start - buffer;
                    let col_end = col_start + correction.length;

                    let new_range = new Range(new Point(row_number, col_start), new Point(row_number, col_end));
                    if (this.isValidScope(new_range)) {

                        excluded_range.push(new_range);
                        this.updateMarker(new_range, correction.replacements[0] || "");
                    }
                }
                this.destroyMarkers(range, excluded_range);
            }
        } finally {
            release();
        }
    }

    isValidScope(range) {
        /**
         * return true if the first char and the last char of the range are in a valid scope
         */
        for (let point of [range.start, new Point(range.end.row, range.end.column - 1)]) {
            const scope = this.editor.scopeDescriptorForBufferPosition(point);
            if (this.manager.scopeIsExcluded(scope)) return false;
        }
        return true;
    }

    updateMarker(range, solution) {
        /**
         * Update the marker if already exists or create a new one
         * solution is the proposed replacement string
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
            markers.splice(0, 1); //remove all other markers (possibly duplicates ones)
            markers.map(m => m.destroy());
            marker.setBufferRange(range, {reversed: false});
        }

        if (solution) {
            marker.setProperties({solution: solution});
        }
    }

    destroyMarkers(range, excludedRange) {
        /**
         * Remove every markers in the range that are not in the list of excluded range
         */
        for (let marker of this.layer.getMarkers()) {
            let markerRange = marker.getBufferRange();
            if (!excludedRange.filter(range => {
                return range.start.column === markerRange.start.column
                    && range.end.column === markerRange.end.column
                    && range.start.row === markerRange.start.row
                    && range.end.row === markerRange.end.row
            }).length) {
                marker.destroy();
            }
        }
    }

    addContextMenuEntries(mouseEvent) {
        // /!\ stolen from spell-check package
        let marker;

        this.manager.clearContextMenuEntries();
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

                this.manager.contextMenuEntries.push({
                    menuItem: atom.contextMenu.add({
                        'atom-text-editor': [{type: 'separator'}],
                    }),
                });

                var commandName = 'grammar-check:correct-mistake-' + this.name + marker.getProperties().id; //unique command name

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
                            return this.manager.clearContextMenuEntries();
                        }
                    );
                })(correction, contextMenuEntry);

                // Add new menu item for correction.
                contextMenuEntry.menuItem = atom.contextMenu.add({
                    'atom-text-editor': [
                        {label: correction, command: commandName},
                    ],
                });
                this.manager.contextMenuEntries.push(contextMenuEntry);

                return this.manager.contextMenuEntries.push({
                    menuItem: atom.contextMenu.add({
                        'atom-text-editor': [{type: 'separator'}],
                    }),
                });

            }
        }
    }

    destroy() {
        this.subscriptions.dispose();
        for (let marker of this.layer.getMarkers()) {
            marker.destroy();
        }
        this.layer.destroy();
    }
}
