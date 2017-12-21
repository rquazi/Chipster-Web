import {
  Component, EventEmitter, Input, Output, ViewChild
} from '@angular/core';
import Tool from "../../../../../model/session/tool";
import {ToolPipe} from "../../../../../shared/pipes/toolpipe.pipe";
import {PipeService} from "../../../../../shared/services/pipeservice.service";
import Module from "../../../../../model/session/module";
import Category from "../../../../../model/session/category";
import {ModulePipe} from "../../../../../shared/pipes/modulepipe.pipe";
import {CategoryPipe} from "../../../../../shared/pipes/categorypipe.pipe";
import {ToolSelection} from "../ToolSelection";
import {Subject} from "rxjs/Subject";
import {SessionData} from "../../../../../model/session/session-data";
import InputBinding from "../../../../../model/session/inputbinding";
import {SearchBoxComponent} from "../../../../../shared/components/search-box/search-box.component";
import * as _ from 'lodash';

@Component({
  selector: 'ch-tool-list',
  templateUrl: './tool-list.component.html',
  styleUrls: ['./tool-list.component.less']
})

export class ToolListComponent {

  @Input() private sessionData: SessionData;
  @Input() private toolSelection: ToolSelection;

  @Output() private onToolSelection = new EventEmitter<ToolSelection>();

  @ViewChild('searchBox') private searchBox: SearchBoxComponent;

  modules: Array<Module> = [];
  tools: Array<Tool> = [];

  private searchTool: string;

  selectedModule: Module = null; // used in modal to keep track of which module has been selected
  selectedCategory: Category = null; // used in modal to keep track of which category has been selected

  selectTool$ = new Subject();


  constructor(
    private pipeService: PipeService) {
  }

  ngOnInit() {
    this.tools = _.cloneDeep(this.sessionData.tools);
    this.modules = _.cloneDeep(this.sessionData.modules);
    this.modules = _.cloneDeep(this.sessionData.modules);

    // trigger parameter validation
    if (this.toolSelection) {
      // make sure the module and category are selected even after changing the session
      this.selectModule(this.toolSelection.module);
      this.selectCategory(this.toolSelection.category);
      this.selectTool(this.toolSelection.tool);
    } else {
      this.selectModule(this.modules[0]);
      this.selectCategory(this.selectedModule.categories[0]);
    }
  }

  selectModule(module: Module) {
    this.selectedModule = module;
    this.selectFirstVisible();
  }

  //defines which tool category the user have selected
  selectCategory(category: Category) {
    this.selectedCategory = category;
  }

  selectFirstVisible() {
    let filteredModules = new ModulePipe(this.pipeService).transform(this.modules, this.searchTool);
    if (filteredModules && filteredModules.indexOf(this.selectedModule) < 0 && filteredModules[0]) {
      this.selectModule(filteredModules[0]);
    }

    let filteredCategories = new CategoryPipe(this.pipeService).transform(this.selectedModule.categories, this.searchTool);
    if (filteredCategories && filteredCategories.indexOf(this.selectedCategory) < 0 && filteredCategories[0]) {
      this.selectCategory(filteredCategories[0]);
    }
  }


  selectTool(tool: Tool) {

    const toolSelection: ToolSelection = {
      tool: tool,
      inputBindings: null,
      category: this.selectedCategory,
      module: this.selectedModule
    };

    console.log('selectTool', tool, toolSelection);

    this.onToolSelection.emit(toolSelection);
  }

  updateBindings(updatedBindings: InputBinding[]) {
    const toolSelection: ToolSelection = {
      tool: this.toolSelection.tool,
      inputBindings: updatedBindings,
      category: this.selectedCategory,
      module: this.selectedModule
    };

    this.selectTool$.next(toolSelection);
  }

  search(value: any) {
    this.searchTool = value;
    this.selectFirstVisible();
  }

  searchEnter() {
    // select the first result
    let visibleTools = new ToolPipe(this.pipeService).transform(this.selectedCategory.tools, this.searchTool);
    if (visibleTools[0]) {
      this.searchTool = null;
      // this.selectTool(visibleTools[0].name.id);
      this.selectTool(visibleTools[0]);
    }
  }

  openChange(isOpen) {
    if (isOpen) {
      this.searchBox.focus();
    }
  }
}
