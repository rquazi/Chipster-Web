import VisualizationList from "./../visualization/visualizationconstants";
import Utils from "../../../../services/utils.service";
import AuthenticationService from "../../../../authentication/authenticationservice";
import Visualization from "../visualization/visualization";
import Dataset from "../../../../model/session/dataset";
import SelectionService from "../selection.service";
import SessionDataService from "../sessiondata.service";

class DatasetBoxComponent {

	static $inject = [
		'$scope', '$routeParams', 'AuthenticationService', '$compile', 'SelectionService',
		'SessionDataService'];

	constructor(
		private $scope: ng.IScope,
		private $routeParams: ng.route.IRouteParamsService,
		private AuthenticationService: AuthenticationService,
		private $compile: ng.ICompileService,
		private SelectionService: SelectionService,
		private SessionDataService: SessionDataService) {
	}

	$onInit() {
		this.$scope.$watchCollection(() => this.SelectionService.selectedDatasets, () => {
			this.setCurrentVisualization(null, null);
		});

		this.$scope.$on('showDefaultVisualization', () => {
			var visualizations = this.getVisualizations();
			if (visualizations.length > 0) {
				this.show(visualizations[0]);
			}
		});

		this.setCurrentVisualization(null, null);
	}

	setCurrentVisualization(newVisualization: Visualization, directive: any) {

		if (this.currentVisualizationDirective) {
			this.currentVisualizationDirective.remove();
		}
		this.currentVisualization = newVisualization;
		this.currentVisualizationDirective = directive;
	}

	show(vis: Visualization) {
		if (!this.SelectionService.isSingleDatasetSelected()) {
			console.log("trying to show visualization, but " + this.SelectionService.selectedDatasets.length + " datasets selected");
			return;
		}
		var directive = angular.element('<' + vis.directive + '/>');
		directive.attr('src', '$ctrl.getDatasetUrl()');
		directive.attr('dataset-id', '$ctrl.getDataset().datasetId');
		directive.attr('selected-datasets', '$ctrl.SelectionService.selectedDatasets');
		this.$compile(directive)(this.$scope);
		var area = angular.element(document.getElementById("visualizationArea"));
		area.empty();
		area.append(directive);
		this.setCurrentVisualization(vis, directive);
	}

	renameDataset() {
		this.SessionDataService.renameDatasetDialog(this.SelectionService.selectedDatasets[0]);
	}

	deleteDatasets() {
		this.SessionDataService.deleteDatasets(this.SelectionService.selectedDatasets);
	}

	exportDatasets() {
		this.SessionDataService.exportDatasets(this.SelectionService.selectedDatasets);
	}

	showHistory() {
		this.SessionDataService.openDatasetHistoryModal();
	}

	getSelectionService() {
		return this.SelectionService;
	}

	getSourceJob() {
		if (this.getSelectionService().selectedDatasets[0]) {
			return this.SessionDataService.getJob(this.getSelectionService().selectedDatasets[0].sourceJob)
		}
		return null;
	}

	getDataset() {
		return this.SelectionService.selectedDatasets[0];
	}

	getDatasetUrl() {
		if (this.getDataset()) {
			return this.SessionDataService.getDatasetUrl(this.getDataset());
		}
	}
}

export default {
	templateUrl: 'views/sessions/session/dataset/dataset.html',
	controller: DatasetBoxComponent
}