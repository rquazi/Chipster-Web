import { Injectable } from "@angular/core";
import { Dataset } from "chipster-js-common";
import { SessionData } from "../../../model/session/session-data";
import { QuerySessionDataService } from "./query-session-data.service";

@Injectable()
export class GetSessionDataService {
  constructor(private querySessionDataService: QuerySessionDataService) {}
  private sessionData: SessionData;

  /**
   * Only use this in session component when loading a new session.
   * @param sessionData
   */
  setSessionData(sessionData: SessionData): void {
    this.sessionData = sessionData;
  }

  getSessionData(): SessionData {
    return this.sessionData;
  }

  /**
   * If given dataset has its own phenodata, return that phenodata.
   * Otherwise search ancestors for a dataset which has phenodata and return phenodata
   * of that ancestor if found.
   *
   * @param dataset
   */
  getPhenodata(dataset: Dataset): string {
    return this.querySessionDataService.getPhenodata(this.sessionData, dataset);
  }

  /**
   * If given dataset has its own phenodata, return given dataset.
   * Otherwise search ancestors for a dataset which has phenodata and return that
   * ancestor if found.
   *
   * @param dataset
   */
  getPhenodataDataset(dataset: Dataset): Dataset {
    return this.querySessionDataService.getPhenodataDataset(
      this.sessionData,
      dataset
    );
  }

  getAncestorDatasetsWithPhenodata(dataset: Dataset): Dataset[] {
    return this.querySessionDataService.getAncestorDatasetsWithPhenodata(
      this.sessionData,
      dataset
    );
  }

  getAncestorDatasetsBottomUpBreadthFirst(dataset: Dataset): Array<Dataset> {
    return this.querySessionDataService.getAncestorsBottomUpBreadthFirstWithFilter(
      this.sessionData,
      [dataset],
      () => true
    );
  }

  getParentDatasets(dataset: Dataset): Dataset[] {
    return this.querySessionDataService.getParentDatasets(
      this.sessionData,
      dataset
    );
  }
}
