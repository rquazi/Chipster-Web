import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import {ToolService} from "./tool.service";
import {ToolTitleComponent} from "./tooltitle.component";
import {ToolListItemComponent} from "./toolsmodal/tool-list/tool-list-item/tool-list-item.component";
import {ToolsComponent} from "./tools.component";
import {ToolsModalComponent} from "./toolsmodal/toolsmodal.component";
import {SharedModule} from "../../../../shared/shared.module";
import {FormsModule} from "@angular/forms";
import { ToolsParameterFormComponent } from './toolsmodal/tools-parameter-form/tools-parameter-form.component';
import {NgbModule} from "@ng-bootstrap/ng-bootstrap";
import { ToolSourceComponent } from './toolsmodal/tool-source/tool-source.component';
import { ToolInputsComponent } from './toolsmodal/tool-inputs/tool-inputs.component';
import { FilterCompatibleDatasetsPipe } from './filter-compatible-datasets.pipe';
import {ManualModule} from "../../../manual/manual.module";
import {ToolListComponent} from "./toolsmodal/tool-list/tool-list.component";
import {ScrollerComponent} from "./scroller/scroller.component";

@NgModule({
  imports: [
    CommonModule,
    SharedModule,
    FormsModule,
    NgbModule,
    ManualModule
  ],
  declarations: [
    ToolTitleComponent,
    ToolListItemComponent,
    ToolsComponent,
    ToolsModalComponent,
    ToolsParameterFormComponent,
    ToolSourceComponent,
    ToolInputsComponent,
    FilterCompatibleDatasetsPipe,
    ToolListComponent,
    ScrollerComponent,
  ],
  providers: [ToolService],
  exports: [ToolsComponent]
})
export class ToolsModule { }
