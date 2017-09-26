import {Component, OnInit, Input, ViewChild, ElementRef} from '@angular/core';
import * as pileup from "pileup";
import {VisualizationModalService} from "../visualizationmodal.service";
import {SelectionService} from "../../selection.service";
import {SessionDataService} from "../../sessiondata.service";
import {SessionData} from "../../../../../model/session/session-data";
import {TypeTagService} from "../../../../../shared/services/typetag.service";
import {Observable} from 'rxjs/Observable';
import Dataset from "../../../../../model/session/dataset";
import {selectedDatasets} from "../../../../../state/selectedDatasets.reducer";


@Component({
  selector: 'ch-genome-browser',
  templateUrl: 'genome-browser.component.html',
  styleUrls: ['./genome-browser.component.less']

})
export class GenomeBrowserComponent implements OnInit {

  @ViewChild('iframe') iframe: ElementRef;

  @Input() selectedDatasets: Array<any>;
  @Input() sessionData: SessionData;

  private pos: string;
  private colorByStrand: string;
  private range: any;
  private sources: Array<any>;
  private doc: any;
  private p: any;
  private content: any;
  private bamUrl: string;
  private baiUrl: string;
  errorMessage: string;
  private loadGenomeBrowser: boolean;

  constructor(private visualizationModalService: VisualizationModalService,
              private selectionService: SelectionService,
              private sessionDataService: SessionDataService,
              private typeTagService: TypeTagService) {


  }


  ngOnChanges() {
    this.getDatasetUrls();

  }

  getDatasetUrls() {
    //User can select either two dataset, or only BAM. If the user select only BAI file, show the error message
    let bamDataset, baiDataset;
    let self = this;

    if ((this.selectedDatasets.length == 1) && (self.typeTagService.isCompatible(this.sessionData, this.selectedDatasets[0], "BAI"))) {
      this.errorMessage = "Please Select the Corresponding BAM file to view the Genome Browser";
      this.loadGenomeBrowser = false;
    } else {
      this.loadGenomeBrowser = true;
      if (this.selectedDatasets.length > 1) {
        this.selectedDatasets.forEach(function (dataset) {
          //Check type
          if (self.typeTagService.isCompatible(self.sessionData, dataset, "BAM")) {
            bamDataset = dataset;
          } else if (self.typeTagService.isCompatible(self.sessionData, dataset, "BAI")) {
            baiDataset = dataset;
          }
        })
      } else if (this.typeTagService.isCompatible(this.sessionData, this.selectedDatasets[0], "BAM")) {
        bamDataset = this.selectedDatasets[0];
        //Here we need to extract the BAI file

        this.sessionData.datasetsMap.forEach(function (dataset) {
          if (((dataset.name.split('.').pop()) == "bai") && ((dataset.name.substr(0, dataset.name.indexOf('.')) === (bamDataset.name.substr(0, bamDataset.name.indexOf('.')))))) {
            baiDataset = dataset;
          }

        })

      }

      if (bamDataset && baiDataset) {
        //Populate the g.browser only when both bam and bai present
        let bamDatasetUrl = this.sessionDataService.getDatasetUrl(bamDataset);
        let baiDatasetUrl = this.sessionDataService.getDatasetUrl(baiDataset);

        Observable.forkJoin([bamDatasetUrl, baiDatasetUrl]).subscribe(results => {
          this.bamUrl = results[0];
          this.baiUrl = results[1];
          console.log(this.bamUrl, this.baiUrl)
          this.initializeDataSources();
          this.onLoad();

        });
      }

    }


  }

  onLoad() {
    this.doc = this.iframe.nativeElement.contentWindow;
    this.doc.document.write(this.content);

    this.p = pileup.create(this.doc.document.getElementById('pileup'), {
      range: this.range,
      tracks: this.sources
    });

    this.doc.close();

  }


  initializeDataSources() {
    let bamSource = pileup.formats.bam({
      url: this.bamUrl,
      indexUrl: this.baiUrl
    });

    this.sources = [
      {
        viz: pileup.viz.genome(),
        isReference: true,
        data: pileup.formats.twoBit({
          url: 'http://www.biodalliance.org/datasets/hg19.2bit'
        }),
        name: 'Reference'
      },
      {
        viz: pileup.viz.scale(),
        name: 'Scale'
      },
      {
        viz: pileup.viz.location(),
        name: 'Location'
      },
      {
        viz: pileup.viz.variants(),
        data: pileup.formats.vcf({
          url: '../../../../../../assets/snv.chr17.vcf'
        }),
        options: {
          variantHeightByFrequency: true,
          onVariantClicked: function (data) {
            var content = "Variants:\n";
            for (var i = 0; i < data.length; i++) {
              content += data[i].id + " - " + data[i].vcfLine + "\n";
            }
            alert(content);
          },
        },
        name: 'Variants'
      },
      {
        viz: pileup.viz.genes(),
        data: pileup.formats.bigBed({
          url: 'http://www.biodalliance.org/datasets/ensGene.bb'
        }),
        name: 'Genes'
      },
      {
        viz: pileup.viz.coverage(),
        data: bamSource,
        cssClass: 'normal',
        name: 'Coverage'
      },
      {
        viz: pileup.viz.pileup(),
        data: bamSource,
        cssClass: 'normal',
        name: 'Alignments'
      },
      {
        viz: pileup.viz.coverage(),
        data: bamSource,
        cssClass: 'tumor',
        name: 'Coverage'
      },
      {
        viz: pileup.viz.pileup({
          viewAsPairs: true
        }),
        data: bamSource,
        cssClass: 'tumor',
        name: 'Alignments'
      }
    ];

    this.range = {contig: 'chr1', start: 72187, stop: 73813};

  }


  openGnomeModal() {
    this.visualizationModalService.openVisualizationModal(this.selectionService.selectedDatasets[0], 'genomebrowser');
  }

  ngOnInit() {
    this.content = `<style>
      /**
 * This is the default stylesheet for pileup.js. Anything that need to change, should be changed here
 */

#pileup {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 50px;
  bottom: 10px;
}


.pileup-root {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.pileup-root > .track {
  display: flex;
  flex-direction: row;
}
.pileup-root text, .track-label {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}
.track-label {
  flex: 0 0 100px;  /* fixed-width track labels */
  text-align: right;
  font-size: 0.9em;
  position: relative;  /* make this an offset parent for positioning the label. */
}
.track-label > span {
  padding-right: 5px;
  width: 100px;
  text-overflow: ellipsis;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  right: 0;
}

/* bottom-justify these track labels */
.track.reference .track-label > span,
.track.variants .track-label > span
{
  bottom: 0;
}

.track-label > span:hover {
  overflow: visible !important;
}

.track-content {
  flex: 1;  /* stretch to fill remaining space */
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}
.track-content > div {
  position: absolute; /* Gets the child of the flex-item to fill height 100% */
}
.track-content canvas {
  display: block;
}

/* controls */
.pileup-root > .controls {
  flex: 0 0 30px;  /* fixed height */
}
.pileup-root > .controls > .track-content {
  overflow: visible;
}
.pileup-root > .controls form.controls {
  margin-bottom: 0;  /* overrides browser default */
}
.pileup-root > .controls .zoom-controls {
  display: inline-block;
}
.pileup-root > .controls .btn-zoom-out:before {
  content: '-';
}
.pileup-root > .controls .btn-zoom-in:before {
  content: '+';
}
.pileup-root > .controls input,
.pileup-root > .controls button,
.pileup-root > .controls select,
.pileup-root > .controls option {
  font-size: 0.9em;
}

.gear {
  margin-left: 0.5em;
  font-size: 2em;
  color: #666;
}
.gear:hover {
  color: black;
}
.menu-container {
  z-index: 1;
  width: 250px;  /* not really 250px, but clears parent constraint */
}
.menu {
  border: 1px solid black;
  border-radius: 2px;
  display: table;
  background: white;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  text-align: left;
}
.menu-header {
  font-weight: bold;
  border-bottom: 1px solid #777;
  padding: 2px 4px;
}
.menu-item {
  padding: 4px;
}
.menu-separator {
  border-top: 1px solid #777;
  height: 0px;
}
.menu-item:hover {
  background: lightblue;
}

.check {
  display: inline-block;
  width: 1em;
}
.check.checked:before {
  content: '✓';
}

/* reference track */
.pileup-root > .reference {
  flex: 0 0 20px;  /* fixed height */
}

.background {
  fill: white;
}
.basepair.A { fill: #188712; }
.basepair.G { fill: #C45C16; }
.basepair.C { fill: #0600F9; }
.basepair.T { fill: #F70016; }
.basepair.U { fill: #F70016; }
.basepair text, text.basepair {
  text-anchor: middle;
}
.loose text {
  font-size: 24;
}
.tight text {
  font-size: 12;
  font-weight: bold;
}

/* gene track */
.pileup-root > .genes {
  flex: 0 0 50px;
}
.gene {
  stroke-width: 1;
  stroke: blue;
}
.gene text {
  font-size: 16px;
  text-anchor: middle;
  stroke: black;
  alignment-baseline: hanging;
}
#sense, #antisense .main {
  stroke: blue;
  fill: none;
  stroke-width: 1;
}
#antisense .offset, #sense .offset {
  stroke: white;
  fill: none;
  stroke-width: 1;
}
.exon {
  fill: blue;
  stroke: none;
}

/* pileup track */
.pileup-root > .pileup {
  flex: 1;  /* stretch to fill remaining space */
}
.pileup .alignment .match {
  fill: #c8c8c8;  /* matches IGV */
}
.pileup text.basepair {
  alignment-baseline: hanging;
  font-size: 12;
  font-weight: bold;
}
.pileup .insert {
  stroke: rgb(97, 0, 216);  /* matches IGV */
  stroke-width: 2;
}
.pileup .delete {
  stroke: black;
  stroke-width: 2;
}
.pileup .network-status {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  top: 30px;
}
.pileup .network-status-message {
  padding: 4px 8px;
  width: auto;
  background: #eee;
  border-radius: 3px;
  border: 1px solid #ccc;
  font-size: small;
  position: absolute;
  text-align: center;
}

.pileup .mate-connector {
  stroke: #c8c8c8;  /* matches IGV */
}

/* variants */
.pileup-root > .variants {
  flex: 0 0 25px;  /* fixed height */
}
.variants rect {
  fill: #ddd;
  stroke: blue;
}

/* coverage track */
.pileup-root > .coverage {
  flex: 0 0 50px;  /* fixed height */
}
.coverage rect.bin {
  stroke-width: 0.1;
  stroke: white;
  fill: #a0a0a0;
}
.coverage .y-axis {
  stroke: black;
  stroke-width: 1;
}
.coverage .y-axis g.tick text {
  color: black;
  font-size: x-small;
  stroke: whitesmoke;
  stroke-width: 2;
  paint-order: stroke;
}
.coverage .y-axis path {
  stroke-width: 0;
}
.coverage rect.y-axis-background {
  fill: white;
  opacity: 0.5;
}

/* location track */
.pileup-root > .location {
  flex: 0 0 20px;  /* fixed height */
}
.location .location-hline, .location .location-vline-left, .location .location-vline-right {
  stroke: gray;
  stroke-width: 1.5;
}
.location .location-label {
  color: black;
  font-size: smaller;
  text-anchor: start;
  dominant-baseline: central;
}

/* scale track */
.pileup-root > .scale {
  flex: 0 0 20px;  /* fixed height */
}
.scale .scale-lline, .scale .scale-rline {
  stroke: gray;
  stroke-width: 1.5;
}
.scale .scale-label {
  color: black;
  font-weight: bold;
  font-size: smaller;
  dominant-baseline: central;
  text-anchor: middle;
}

</style>
<div id="pileup">
 </div>`;


    //let pileup = window['pileup'];

  }


}
