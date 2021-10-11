'use babel';

import {CompositeDisposable} from 'atom';
import {Point} from 'atom';
import {Range} from 'atom';

module.exports = GrammarChecker = class GrammarChecker {
    constructor(editor) {
        this.editor = editor;

        this.gingerbread = require('gingerbread');

        let last_line = this.editor.getLastBufferRow();
        this.correct(new Range(new Point(0, 0), new Point(last_line + 1, 0)));

        this.subscriptions = new CompositeDisposable();
        this.subscriptions.add(editor.onDidStopChanging(() => {
                let range = this.editor.getCurrentParagraphBufferRange();
                if (range) {
                    this.correct(range);
                }
            }
        ));
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
                        this.update_marker(new_range);
                    }
                    this.destroy_markers(row_number, excluded_range, line.length);
                });
            }

        }
        console.log("Num of markers: ", this.editor.getMarkerCount());
    }

    update_marker(range) {
        /**
         * Update the marker if already exists or create a new one
         */
        let markers = this.editor.findMarkers({"containsBufferRange": range});
        markers = markers.filter(marker => marker.getBufferRange().start !== range.end);//remove the "sticked" markers
        if (!markers.length) { // if not already marked, create a marker
            let marker = this.editor.markBufferRange(range);
            this.editor.decorateMarker(marker, {
                type: 'highlight',
                class: 'sim-check-misspelling',
                deprecatedRegionClass: 'misspelling',
            });
        } else { // if already marked, we update his range
            markers[0].setBufferRange(range, {reversed: false});
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
                for (marker of this.editor.findMarkers({"containsBufferRange": searching_range})) {
                    marker.destroy();
                }
                ++current;
            }
        }
    }

    destroy() {
        this.subscriptions.dispose();
        for (marker of this.editor.getMarkers()) {
            marker.destroy();
        }
    }
}
