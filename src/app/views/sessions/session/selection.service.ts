import Dataset from "../../../model/session/dataset";
import Job from "../../../model/session/job";
import Tool from "../../../model/session/tool";
import UtilsService from "../../../shared/utilities/utils";
import * as _ from "lodash";
import {Injectable} from "@angular/core";
import {Subject} from "rxjs";
import SelectionEvent from "../../../model/events/selectionevent";
import {Action} from "../../../model/events/selectionevent";

@Injectable()
export class SelectionService {

    // selections
    selectedDatasets: Dataset[] = [];
    selectedJobs: Job[] = [];

    activeDatasetId: string;

    // tool selection
    selectedTool: Tool = null;
    selectedToolIndex = -1;
    istoolselected = false;

    datasetSelectionSubject$ = new Subject<SelectionEvent>();
    jobSelectionSubject$ = new Subject<SelectionEvent>();
    toolSelectionSubject$ = new Subject<SelectionEvent>();



    /**
     * Check if there are one or more jobs selected
     * @returns {boolean}
     */
    isJobSelected() {
        return this.selectedJobs.length > 0;
    }

    /**
     * Check if given dataset is selected
     * @param data
     * @returns {boolean}
     */
    isSelectedDataset(data: Dataset) {
        return this.selectedDatasets.indexOf(data) !== -1;
    }

    toggleDatasetSelection($event: any, data: Dataset, allDatasets: any[]) {
        this.activeDatasetId = data.datasetId;

        let oldDatasets = _.clone(this.selectedDatasets);
        let oldIdsSet = new Set(this.selectedDatasets.map(dataset => dataset.datasetId));

        UtilsService.toggleSelection($event, data, allDatasets, this.selectedDatasets);
        this.selectedDatasets = _.clone(this.selectedDatasets); // clone array so that changes on it can be tracen in $onChanges-block

        let newIdsSet = new Set(this.selectedDatasets.map(dataset => dataset.datasetId));

        oldDatasets.filter(dataset => !newIdsSet.has(dataset.datasetId)).forEach(dataset => {
            this.datasetSelectionSubject$.next(new SelectionEvent(Action.Remove, dataset));
        });

        this.selectedDatasets.filter(dataset => !oldIdsSet.has(dataset.datasetId)).forEach(dataset => {
            this.datasetSelectionSubject$.next(new SelectionEvent(Action.Add, dataset))
        });
    }

    clearSelection() {

        let unselectedDatasets = _.clone(this.selectedDatasets);
        this.selectedDatasets.length = 0;
        // send events only after the array is cleared in case some component get's the latest
        // state from the service instead of the event
        unselectedDatasets.forEach((dataset) => {
          this.datasetSelectionSubject$.next(new SelectionEvent(Action.Remove, dataset))
        });

        let unselectedJobs = _.clone(this.selectedJobs);
        this.selectedJobs.length = 0;
        unselectedJobs.forEach((job) => {
          this.jobSelectionSubject$.next(new SelectionEvent(Action.Remove, job))
        });
    }

    selectJob(event: any, job: Job) {
        this.clearSelection();
        this.selectedJobs = [job];

        this.jobSelectionSubject$.next(new SelectionEvent(Action.Add, job))
    }

    getDatasetSelectionStream() {
        // don't expose the subject directly
        return this.datasetSelectionSubject$.asObservable();
    }

    getJobSelectionStream() {
        // don't expose the subject directly
        return this.jobSelectionSubject$.asObservable();
    }

  setSelectedDatasets(datasets: Dataset[]) {
    this.clearSelection();
    datasets.forEach(dataset => {
      this.selectedDatasets.push(dataset);
      this.datasetSelectionSubject$.next(new SelectionEvent(Action.Add, dataset))
    });
  }
}
