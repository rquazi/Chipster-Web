import { Component, Input } from "@angular/core";
import { Dataset, Module } from "chipster-js-common";
import * as _ from "lodash";
import log from "loglevel";
import { forkJoin, Observable } from "rxjs";
import { RestErrorService } from "../../../../core/errorhandler/rest-error.service";
import { SessionData } from "../../../../model/session/session-data";
import { DatasetsearchPipe } from "../../../../shared/pipes/datasetsearch.pipe";
import UtilsService from "../../../../shared/utilities/utils";
import { SelectionHandlerService } from "../selection-handler.service";
import { SelectionService } from "../selection.service";
import { SessionDataService } from "../session-data.service";

@Component({
  selector: "ch-session-panel",
  templateUrl: "./session-panel.component.html",
  styleUrls: ["./session-panel.component.less"]
})
export class SessionPanelComponent {
  @Input()
  sessionData: SessionData;
  @Input()
  modulesMap: Map<string, Module>;

  datasetSearch: string;

  // noinspection JSUnusedLocalSymbols
  constructor(
    public sessionDataService: SessionDataService, // used by template
    private datasetsearchPipe: DatasetsearchPipe,
    private selectionHandlerService: SelectionHandlerService,
    private selectionService: SelectionService,
    private restErrorService: RestErrorService
  ) {} // used by template

  search(value: any): void {
    this.datasetSearch = value;
  }

  searchEnter(): void {
    // select highlighted datasets when the enter key is pressed
    const allDatasets = this.sessionDataService.getDatasetList(
      this.sessionData
    );
    this.selectionHandlerService.setDatasetSelection(
      this.datasetsearchPipe.transform(allDatasets, this.datasetSearch)
    );
    this.datasetSearch = null;
  }

  toggleDatasetSelection($event: any, dataset: Dataset): void {
    if (UtilsService.isCtrlKey($event)) {
      this.selectionHandlerService.toggleDatasetSelection([dataset]);
    } else if (UtilsService.isShiftKey($event)) {
      //  datasets and their ids in the order of the dataset list
      const allDatasets = this.sessionDataService.getDatasetListSortedByCreated(
        this.sessionData
      );

      // only apply to those filtered by dataset search
      const searchDatasets = this.datasetsearchPipe.transform(
        allDatasets,
        this.datasetSearch
      );
      const searchIds = searchDatasets.map(d => d.datasetId);

      // indexes of the old selection in the dataset list
      const selectedIndexes = this.selectionService.selectedDatasets.map(d =>
        searchIds.indexOf(d.datasetId)
      );
      const clickIndex = searchIds.indexOf(dataset.datasetId);
      const newMin = Math.min(clickIndex, ...selectedIndexes);
      const newMax = Math.max(clickIndex, ...selectedIndexes);

      // datasets within the index range
      const newSelection = _.range(newMin, newMax + 1).map(
        i => searchDatasets[i]
      );
      this.selectionHandlerService.setDatasetSelection(newSelection);
    } else {
      this.selectionHandlerService.setDatasetSelection([dataset]);
    }
  }

  autoLayout(): void {
    const updates: Observable<any>[] = [];
    this.sessionData.datasetsMap.forEach(d => {
      if (d.x || d.y) {
        d.x = null;
        d.y = null;
        updates.push(this.sessionDataService.updateDataset(d));
      }
    });

    forkJoin(updates).subscribe(
      () => log.debug(updates.length + " datasets updated"),
      err => this.restErrorService.showError("layout update failed", err)
    );
  }

  getDatasetListSorted(): Dataset[] {
    return this.sessionDataService.getDatasetListSortedByCreated(
      this.sessionData
    );
  }
}
