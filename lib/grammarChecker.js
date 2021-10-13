'use babel';

import {CompositeDisposable} from 'atom';
import {Point} from 'atom';
import {Range} from 'atom';

module.exports = GrammarChecker = class GrammarChecker {
    constructor(editor, spellCheckModule, name) {
        this.editor = editor;
        this.spellCheckModule = spellCheckModule;
        this.name = name;
        this.markerCounter = 0;

        this.gingerbread = require('gingerbread');

        this.correct_all();

        this.subscriptions = new CompositeDisposable();
        this.subscriptions.add(editor.onDidStopChanging(() => {
                let range = this.editor.getCurrentParagraphBufferRange();
                if (range) {
                    this.correct(range);
                }
            }
        ));

        this.layer = this.editor.addMarkerLayer();


        atom.views.getView(this.editor).addEventListener('contextmenu', (mouseEvent) => this.add_context_menu_entries(mouseEvent));
    }

    correct_all(){
        let last_line = this.editor.getLastBufferRow();
        this.correct(new Range(new Point(0, 0), new Point(last_line + 1, 0)));
    }

    correct(range) {
        // highlight mistake in the range, unhighlight corriged mistakes
        let text = this.editor.getTextInBufferRange(range);
        if (text) {
            let general_raw_counter = range.start.row;
            for (line of text.split("\n")) {
                let row_number = general_raw_counter++;
                this.gingerbread(line, (error, text, result, corrections) => {
                    let excluded_range = [];
                    for (correction of corrections) {
                        //console.log(correction);
                        let col_start = range.start.column + correction.start;
                        let col_end = col_start + correction.length
                        excluded_range.push([col_start, col_end]);

                        let new_range = new Range(new Point(row_number, col_start), new Point(row_number, col_end));
                        this.update_marker(new_range, correction.correct);
                    }
                    this.destroy_markers(row_number, excluded_range, line.length);
                });
            }

        }
    }

    update_marker(range, solution) {
        /**
         * Update the marker if already exists or create a new one
         * solution is the proposed replacment string
         */
        for (point of [range.start, range.end]) {
            const scope = this.editor.scopeDescriptorForBufferPosition(range.start);
            if (this.spellCheckModule.scopeIsExcluded(scope))return;
        }


        let markers = this.editor.findMarkers({"containsBufferRange": range});
        markers = markers.filter(marker => marker.getBufferRange().start !== range.end);//remove the "sticked" markers

        let marker;
        if (!markers.length) { // if not already marked, create a marker
            marker = this.layer.markBufferRange(range);
            marker.setProperties({
                "solution": "",
                "id": this.markerCounter++
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
            marker.setProperties({"solution": solution});
        }
    }

    destroy_markers(row_number, excluded_range, final_column_number) {
        /** Remove every markers that contain a "point" at line row number. If the marker is on a excluded_range, then it is'nt removed
         * row_number: Number
         * excluded_range [[a,b]] where the range a,b is to exclude. a & b are Number and represent column numbers
         *   the list must be ordonate
         * final_column_number: last column number
         */
        let current = 0;
        let current_excluded_range = 0;
        while (current <= final_column_number) {
            if (current_excluded_range < excluded_range.length && current >= excluded_range[current_excluded_range][0]) {
                current = excluded_range[current_excluded_range][1] + 1;
                ++current_excluded_range;
            } else {
                let searching_range = new Range(new Point(row_number, current), new Point(row_number, current));
                for (marker of this.layer.findMarkers({"containsBufferRange": searching_range})) {
                    marker.destroy();
                }
                ++current;
            }
        }
    }

    add_context_menu_entries(mouseEvent) {
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
