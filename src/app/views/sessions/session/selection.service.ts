import Dataset from "../../../model/session/dataset";
import Job from "../../../model/session/job";
import * as _ from "lodash";
import {Injectable} from "@angular/core";
import {Store} from "@ngrx/store";

@Injectable()
export class SelectionService {

    // Selected datasets and jobs
    selectedDatasets: Array<Dataset>; // USE SELECTION-HANDLER SERVICE TO MODIFY
    selectedJobs: Array<Job>; // USE SELECTION-HANDLER SERVICE TO MODIFY

    constructor(private store: Store<any>) {

      // Sync selected datasets from store
      this.store.select('selectedDatasets').subscribe(
        (datasets: Array<Dataset>) => { this.selectedDatasets = datasets },
        (error: any) => { console.error('Error fetching datasets from store', error) }
      );

      // Sync selected jobs from store
      this.store.select('selectedJobs').subscribe(
        (jobs: Array<Job>) => { this.selectedJobs = jobs },
        (error: any) => { console.error('Error fetching jobs from store', error) }
      );

    }

    isJobSelected(): boolean {
        return this.selectedJobs.length > 0;
    }

    /*
     * @description: search by dataset object if given dataset is currently selected
     */
    isSelectedDataset(dataset: Dataset):boolean {
      return this.isSelectedDatasetById(dataset.datasetId);
    }

    /*
     * @description: search by id if given dataset is currently selected
     */
    isSelectedDatasetById(datasetId: string):boolean {
      return _.some( this.selectedDatasets, (dataset: Dataset) => dataset.datasetId === datasetId);
    }

}
