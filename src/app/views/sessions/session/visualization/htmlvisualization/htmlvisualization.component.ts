import {Component, Input, OnChanges} from '@angular/core';
import {timeout} from "d3-timer";
import {TokenService} from "../../../../../core/authentication/token.service";
import {SessionDataService} from "../../sessiondata.service";
import Dataset from "../../../../../model/session/dataset";

@Component({
  selector: 'ch-htmlvisualization',
  template: `<iframe #htmlframe *ngIf="src" width="100%" [src]="wrapperUrl + '?location=' + src  | trustedresource" scrolling="no" frameborder="0" (load)="run(htmlframe)"></iframe>`
})
export class HtmlvisualizationComponent implements OnChanges {

  @Input()
  private dataset: Dataset;

  private src: string;
  private wrapperUrl: string = 'assets/htmlvisualizationwrapper.html';

  constructor(
    private sessionDataService: SessionDataService) { }

  ngOnChanges() {
    this.sessionDataService.getDatasetUrl(this.dataset).subscribe(url => {
      this.src = encodeURIComponent(url);
    });
  }

  run(htmlframe) {
    timeout( () => {
      let height = htmlframe.contentWindow.document.body.style.height;
      if (height) {
        htmlframe.height = height + 'px';
      } else {
        this.run(htmlframe);
      }
    }, 100);
  }
}
