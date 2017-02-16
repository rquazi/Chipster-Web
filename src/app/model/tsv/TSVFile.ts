import * as _ from "lodash";
import TSVHeaders from "./TSVHeaders";
import TSVBody from "./TSVBody";
import TSVRow from "./TSVRow";

export default class TSVFile {

    public headers: TSVHeaders;
    public body: TSVBody;

    constructor(tsv: Array<Array<string>>, public datasetId: string, public filename: string) {
        // normalize header-row in tsv-file so that if headers are missing a column
        // or identifier is indicated by an empty string

        const normalizedHeaders = this.getNormalizeHeaders(tsv);
        this.headers = new TSVHeaders(normalizedHeaders);
        this.body = new TSVBody(_.tail(tsv));
        datasetId;
        filename;
    }

    /*
     * @description: return unfiltered tsv-data. Note that data is normalized.
     */
    public getRawData(): Array<Array<string>> {
      const headers = this.headers.headers;
      const body = this.body.getRawDataRows();
      return [headers, ...body];
    }

    /*
     * @description: get raw TSVFile-data in its initial form
     */
    public getRawDataByRowIds(ids: Array<string>): Array<Array<string>> {
        const headers = this.headers.headers;
        const body = this.body.getRawDataByRowIds(ids);
        return [headers, ...body];
    }

    /*
     * @description: Get values from TSVbody column by given header-key
     */
    public getColumnDataByHeaderKey( key: string ): Array<string> {
        let columnIndex = this.getColumnIndex(key);
        return this.body.rows.map( (tsvRow: TSVRow) => tsvRow.row[columnIndex]);
    }

    /*
     * @description: get columndata of multiple headers.
     */
    public getColumnDataByHeaderKeys( keys: Array<string> ): Array<Array<string>> {
        const columnIndexes = keys.map( (key: string) => this.getColumnIndex(key));
        return this.body.rows.map( (tsvRow: TSVRow) => columnIndexes.map( (index: number) => tsvRow.row[index]));
    }

    /*
     * @description: get column index matching
     */
    public getColumnIndex(key: string): number {
        return this.headers.getColumnIndexByKey(key);
    }

    private getNormalizeHeaders(tsv: Array<Array<string>>) {
        const isMissingHeader = this.isMissingHeader(tsv);
        let headers = tsv[0];

        if(isMissingHeader) {
            headers.unshift('identifier');
            return headers;
        }

        if(headers.indexOf(' ') !== -1) {
            headers[headers.indexOf(' ')] = 'identifier';
            return headers;
        }

        return headers;
    }

    private isMissingHeader(tsv: Array<Array<string>>) {
      if (tsv.length <= 1) {
        // have to guess
        return false;
      }
      return tsv[0].length < tsv[1].length;
    }

}
