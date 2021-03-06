'use babel';

import {CompositeDisposable, Point, Range} from 'atom';
import {Mutex} from 'async-mutex';

export class GrammarChecker {
    constructor(editor, manager, name, correcter, correcterArgs = {}) {
        //correcterArgs is an object with additional possible arguments for the funtion correcter
        this.editor = editor;
        this.manager = manager;
        this.name = name;
        this.markerCounter = 0;
        this.layer = this.editor.addMarkerLayer();
        this.correctionMutex = new Mutex();
        this.correcter = correcter;
        this.correcterArgs = correcterArgs;

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
        for (let marker of this.layer.getMarkers()) {
            marker.destroy();
        }

        let last_line = this.editor.getLastBufferRow();
        let range = new Range(new Point(0, 0), new Point(last_line + 1, 0));
        this.correct(range);
    }

    async correct(range) {
        if (this.correctionMutex.isLocked()) {// if a correction is processing, abort
            return;
        }
        const release = await this.correctionMutex.acquire();
        try {
            // highlight mistakes in the range, unhighlight fixed mistakes
            let text = this.editor.getTextInBufferRange(range);

            if (text) {
                let column_shift = range.start.column;
                let general_raw_counter = range.start.row;
                let row_number = general_raw_counter++;

                let corrections = await this.correcter(text, this.correcterArgs);

                let excluded_range = [];
                let buffer = 0; // all the text before this position is already parsed
                for (let i = 0; i < corrections.length; ++i) {
                    let correction = corrections[i];

                    // find the line number of the correction
                    let firstNewLine = text.indexOf("\n", buffer);
                    while (firstNewLine !== -1 && firstNewLine < correction.start) {
                        buffer = firstNewLine + 1;
                        ++row_number;
                        column_shift = 0;
                        firstNewLine = text.indexOf("\n", buffer);
                    }

                    let col_start = correction.start - buffer + column_shift;
                    let col_end = col_start + correction.length;

                    let new_range = new Range(new Point(row_number, col_start), new Point(row_number, col_end));

                    const scope = this.editor.scopeDescriptorForBufferPosition(new_range.start);
                    if (this.manager.scopeIsValid(scope)) {
                        excluded_range.push(new_range);
                        this.updateMarker(new_range, correction.replacements || []);
                    }
                }
                this.destroyMarkers(range, excluded_range);
            }
        } finally {
            release();
        }
    }



    updateMarker(range, replacements) {
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
                replacements: [],
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

        if (replacements) {
            marker.setProperties({replacements: replacements});
        }
    }

    /**
     * Remove every markers in the range that are not in the list of excluded range
     * @param range {Range}
     * @param excludedRange {list[Range]}
     */
    destroyMarkers(range, excludedRange) {
        for (let marker of this.layer.getMarkers().filter(marker => this.rangeInRange(marker.getBufferRange(), range))) {
            let markerRange = marker.getBufferRange();
            if (!excludedRange.some(range => this.equalMarkers(range, markerRange))) {
                marker.destroy();
            }
        }
    }

    /**
     * Compare the equality between 2 Range
     * @param m1 {Range}
     * @param m2 {Range}
     * @returns {boolean} true if they have the same range
     */
    equalMarkers(m1, m2){
       return m1.start.column === m2.start.column
           && m1.end.column === m2.end.column
           && m1.start.row === m2.start.row
           && m1.end.row === m2.end.row;
    }

    /**
     * Compute if range m1 is included in range m2.
     * @param m1 {Range}
     * @param m2 {Range}  It's considered that m2 starts at column 0 and finish at an end of a line
     * @returns {boolean} true if m1 in m2
     */
    rangeInRange(m1, m2){
        return m2.start.row <= m1.start.row
            && m2.end.row >= m1.end.row;
    }

    /**
     * Return a range from a point. The result range starts on the first previous blank line and end on the next one
     * from the given point
     * @param row {int}
     * @returns {Range}
     */
    getRangeFromRow(row){
        let textBuffer = this.editor.getBuffer();
        let start = Point(textBuffer.previousNonBlankRow(row)+1, 0);
        let end = Point(textBuffer.nextNonBlankRow(row)-1, 0);
        return Range(start, end);
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
            const corrections = marker.getProperties().replacements;
            if (corrections.length) {

                this.manager.contextMenuEntries.push({
                    menuItem: atom.contextMenu.add({
                        'atom-text-editor': [{type: 'separator'}],
                    }),
                });

                let commandName = 'grammar-check:correct-mistake-' + this.name + marker.getProperties().id; //unique command name

                for(let i = 0; i < corrections.length; ++i) {
                    const contextMenuEntry = {};

                    let correction = corrections[i];
                    contextMenuEntry.command = (correction => {
                        return atom.commands.add(
                            atom.views.getView(this.editor),
                            commandName + i,
                            () => {
                                let range = marker.getBufferRange();
                                let row = range.start.row; // line of the correction
                                this.editor.setTextInBufferRange(range, correction);
                                marker.destroy();
                                this.correct(this.getRangeFromRow(row)) // correct the range where the change occurs
                                return this.manager.clearContextMenuEntries();
                            }
                        );
                    })(correction, contextMenuEntry);

                    // Add new menu item for correction.
                    contextMenuEntry.menuItem = atom.contextMenu.add({
                        'atom-text-editor': [
                            {label: correction, command: commandName + i},
                        ],
                    });
                    this.manager.contextMenuEntries.push(contextMenuEntry);
                }
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
