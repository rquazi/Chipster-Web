import { Injectable } from "@angular/core";
import { Dataset, InputBinding, ToolParameter } from "chipster-js-common";
import * as _ from "lodash";
import log from "loglevel";
import { forkJoin, forkJoin as observableForkJoin, Observable, of } from "rxjs";
import { map } from "rxjs/operators";
import { PhenodataBinding } from "../../../model/session/phenodata-binding";
import { SessionData } from "../../../model/session/session-data";
import UtilsService from "../../../shared/utilities/utils";
import { DatasetService, SampleGroups } from "./dataset.service";
import { GetSessionDataService } from "./get-session-data.service";
import { ToolService } from "./tools/tool.service";
import {
  SelectedTool,
  SelectedToolWithInputs,
  SelectedToolWithValidatedInputs,
  SelectedToolWithValidatedParameters,
  ValidatedTool,
  ValidationResult,
} from "./tools/ToolSelection";

export interface SelectionOption {
  id: string;
  displayName: string;
}
@Injectable()
export class ToolSelectionService {
  constructor(
    private toolService: ToolService,
    private getSessionDataService: GetSessionDataService,
    private datasetService: DatasetService
  ) {}

  getValidatedTool(
    toolWithValidatedParams: SelectedToolWithValidatedParameters,
    sessionData: SessionData,
    validateRunForEachSample = true // needs to be false when rebinding for each sample
  ) {
    const runForEachValidationResult: ValidationResult =
      this.validateRunForEach(toolWithValidatedParams, sessionData);

    // FIXME if not needed later on, remove from here and do this at toolSelectionService.validateRunForEachSample
    // may be needed for the run button
    const sampleGroups = this.datasetService.getSampleGroups(
      toolWithValidatedParams.selectedDatasets
    );

    const runForEachSampleValidationResult: ValidationResult =
      validateRunForEachSample
        ? this.validateRunForEachSample(
            toolWithValidatedParams,
            sampleGroups,
            sessionData
          )
        : { valid: false };

    const singleJobValidationMessage = this.getValidationMessage(
      toolWithValidatedParams.parametersValidation.valid,
      toolWithValidatedParams
    );

    const singleJobValidationResult: ValidationResult = {
      valid:
        toolWithValidatedParams.singleJobInputsValidation.valid &&
        toolWithValidatedParams.phenodataValidation.valid &&
        toolWithValidatedParams.parametersValidation.valid,
      message: singleJobValidationMessage,
    };

    return Object.assign(
      {
        singleJobValidation: singleJobValidationResult,
        runForEachValidation: runForEachValidationResult,
        runForEachSampleValidation: runForEachSampleValidationResult,
        sampleGroups: sampleGroups,
      },
      toolWithValidatedParams
    );
  }

  validateParameters(
    toolWithValidatedInputs: SelectedToolWithValidatedInputs
  ): SelectedToolWithValidatedParameters {
    const parametersValidations = new Map<string, ValidationResult>();
    if (
      toolWithValidatedInputs &&
      toolWithValidatedInputs.tool &&
      toolWithValidatedInputs.tool.parameters &&
      toolWithValidatedInputs.tool.parameters.length > 0
    ) {
      toolWithValidatedInputs.tool.parameters.forEach(
        (parameter: ToolParameter) => {
          parametersValidations.set(
            parameter.name.id,
            this.validateParameter(parameter)
          );
        }
      );
    }

    const parametersValid = Array.from(parametersValidations.values()).every(
      (result: ValidationResult) => result.valid
    );

    return Object.assign(
      {
        parametersValidation: {
          valid: parametersValid,
          message: "Invalid parameters", // TODO add more details
        },
        parametersValidationResults: parametersValidations,
      },
      toolWithValidatedInputs
    );
  }

  validateParameter(parameter: ToolParameter): ValidationResult {
    // required parameter must not be emtpy
    if (!parameter.optional && !this.parameterHasValue(parameter)) {
      return { valid: false, message: "Required parameter can not be empty" };
    }

    // numbers
    if (
      this.parameterHasValue(parameter) &&
      this.toolService.isNumberParameter(parameter)
    ) {
      // integer must be integer
      if (
        parameter.type === "INTEGER" &&
        !Number.isInteger(parameter.value as number)
      ) {
        return {
          valid: false,
          message: "Value must be an integer",
        };
      }
      // min limit
      if (parameter.from && parameter.value < parameter.from) {
        return {
          valid: false,
          message: "Value must be greater than or equal to " + parameter.from,
        };
      }

      // max limit
      if (parameter.to && parameter.value > parameter.to) {
        return {
          valid: false,
          message: "Value must be less than or equal to " + parameter.to,
        };
      }
    } else if (
      this.parameterHasValue(parameter) &&
      parameter.type === "STRING"
    ) {
      // this regex should be same as that on the server side
      // uglifyjs fails if using literal reg exp
      // unlike with the java version on the server side
      // '-' doesn't seem to work in the middle, escaped or not, --> it's now last

      // firefox doesn't support unicode property escapes yet so catch
      // the error, server side will validate it anyway and fail the job
      // const regExp: RegExp = new RegExp("[^\\p{L}\\p{N}+_:.,*() -]", "u");

      // creating the RegExp fails in firefox
      let regExp: RegExp;
      try {
        regExp = new RegExp("[^\\p{L}\\p{N}+_:.,*() -]", "u");
      } catch (e) {
        log.warn("failed to create RegExp, parameter validation failed");
        return {
          valid: true,
        };
      }

      if (!this.testRegExpSupport(regExp)) {
        log.warn("validating string parameter failed");
        return {
          valid: true,
        };
      }

      const result = regExp.exec(parameter.value as string);
      return result === null
        ? { valid: true }
        : {
            valid: false,
            message: "Illegal character '" + result[0] + "'",
          };
    }

    return { valid: true };
  }

  private testRegExpSupport(regExp: RegExp): boolean {
    const testString = "a";
    let result: RegExpExecArray;

    try {
      result = regExp.exec(testString);
    } catch (e) {
      // shouldn't happen, firefox fails at RegExp creation, which happens earlier
      log.warn("RegExp test failed with exception", e);
      return false;
    }

    // check for RegExp support in Edge
    // null result means string is valid, as it should be for the test strinng
    // if not null, RegExp not supported properly
    if (result !== null) {
      log.warn("RegExp not supported properly");
      return false;
    } else {
      return true;
    }
  }

  parameterHasValue(parameter: ToolParameter): boolean {
    if (parameter.value == null) {
      return false;
    }

    return this.toolService.isColumnSelectionParameter(parameter)
      ? true
      : String(parameter.value).trim() !== "";
  }

  populateParameters(
    selectedToolWithInputs: SelectedToolWithValidatedInputs,
    sessionData: SessionData
  ): Observable<SelectedToolWithValidatedInputs> {
    if (selectedToolWithInputs.tool) {
      // get bound datasets for populating (dataset dependent) parameters
      const boundDatasets = selectedToolWithInputs.inputBindings.reduce(
        (datasets: Array<Dataset>, inputBinding: InputBinding) => {
          return datasets.concat(inputBinding.datasets);
        },
        []
      );

      // get bound phenodatas for populating (phenodata dependent) parameters
      const boundPhenodatas = selectedToolWithInputs.phenodataBindings
        .map((phenodataBinding: PhenodataBinding) => phenodataBinding.dataset)
        .filter((dataset) => dataset != null)
        .map((dataset) => this.getSessionDataService.getPhenodata(dataset));

      // populating params is async as some selection options may require dataset contents
      const populateParameterObservables =
        selectedToolWithInputs.tool.parameters.map(
          (parameter: ToolParameter) => {
            return this.populateParameter(
              parameter,
              boundDatasets,
              boundPhenodatas,
              sessionData
            );
          }
        );
      return forkJoin(populateParameterObservables).pipe(
        map(() => {
          return selectedToolWithInputs;
        })
      );
    }
    return of(selectedToolWithInputs);
  }

  /**
   * Always return an observable, which emits at least one value and then completes.
   * This is needed because we use forkJoin for combining parameter populating and
   * forkJoin completes immediately if one of the observables complete without
   * emitting anything. Also if one of the observables doesn't complete, forkJoin
   * won't complete.
   */
  populateParameter(
    parameter: ToolParameter,
    datasets: Array<Dataset>,
    phenodatas: Array<string>,
    sessionData: SessionData
  ): Observable<ToolParameter> {
    // for other than column selection parameters, set to default if no value
    if (
      !this.toolService.isColumnSelectionParameter(parameter) &&
      !parameter.value
    ) {
      parameter.value = this.toolService.getDefaultValue(parameter);
      return of(parameter);
    }

    // column selection parameters
    if (this.toolService.isColumnSelectionParameter(parameter)) {
      // no datasets --> set to null
      if (datasets && datasets.length < 1) {
        parameter.selectionOptions = [];
        parameter.value = null;
        return of(parameter);
      }

      // COLUMN_SEL, getting headers is async
      if (parameter.type === "COLUMN_SEL") {
        // populate column_sel only for tsv files
        // FIXME should check type tag instead of name, atm would need sessionData for that
        // FIXME we have session data here these days
        if (!datasets[0].name.endsWith(".tsv")) {
          parameter.selectionOptions = [];
          parameter.value = null;
          return of(parameter);
        }

        return observableForkJoin(
          this.toolService.getDatasetHeadersForParameter(datasets, sessionData)
        ).pipe(
          map((headersForAllDatasets: Array<Array<SelectionOption>>) => {
            // FIXME make options unique in case several datasets selected
            // for now headers come only from the first datasets
            const selectionOptions = _.flatten(headersForAllDatasets);
            parameter.selectionOptions = selectionOptions;
            this.setColumnSelectionParameterValueAfterPopulate(parameter);
            return parameter;
          })
        );
      } else if (parameter.type === "METACOLUMN_SEL") {
        // METACOLUMN_SEL
        parameter.selectionOptions = this.toolService
          .getMetadataColumns(phenodatas)
          .map((column) => {
            return { id: column };
          });

        this.setColumnSelectionParameterValueAfterPopulate(parameter);
        return of(parameter);
      }
    }

    return of(parameter); // always return, even if nothing gets done
  }

  validateInputs(toolWithInputs: SelectedToolWithInputs): ValidationResult {
    if (!toolWithInputs.tool || toolWithInputs.tool.inputs.length < 1) {
      // inputs are valid if tool has no  inputs
      return { valid: true };
    } else if (
      toolWithInputs.selectedDatasets.length >
        this.toolService.getInputCountWithoutPhenodata(toolWithInputs.tool) &&
      !this.toolService.hasMultiInputs(toolWithInputs.tool)
    ) {
      // more selected files than inputs
      return {
        valid: false,
        message:
          "Too many files selected. Tool takes " +
          UtilsService.getCountAndUnit(
            this.toolService.getInputCountWithoutPhenodata(toolWithInputs.tool),
            "input"
          ) +
          ", " +
          toolWithInputs.selectedDatasets.length +
          " files selected.",
      };
    }

    // check that every required input is bound
    // phenodata inputs are not included in the bindings, so no need to deal with them
    const bindingsValid = toolWithInputs.inputBindings.every(
      (binding: InputBinding) => {
        return binding.toolInput.optional || binding.datasets.length > 0;
      }
    );
    if (!bindingsValid) {
      if (toolWithInputs.selectedDatasets.length === 0) {
        return {
          valid: false,
          message: "Tool has required inputs but no files selected.",
        };
      } else {
        return {
          valid: false,
          message:
            "Selected files are not compatible with required tool inputs",
        };
      }
    }

    // check that there are no unbound datasets
    const boundDatasetIds: string[] = toolWithInputs.inputBindings
      .reduce((array: Dataset[], inputBinding: InputBinding) => {
        array.push(...inputBinding.datasets);
        return array;
      }, [])
      .filter((dataset) => dataset != null)
      .map((dataset) => dataset.datasetId);

    const allDatasetsBound: boolean =
      toolWithInputs.selectedDatasets.length === 0 ||
      toolWithInputs.selectedDatasets.every((dataset) =>
        boundDatasetIds.includes(dataset.datasetId)
      );

    if (allDatasetsBound) {
      return { valid: true };
    } else if (
      toolWithInputs.tool.inputs.some((toolInput) =>
        this.toolService.isMultiInput(toolInput)
      )
    ) {
      return {
        valid: false,
        message: "Incompatible input files",
      };
    } else {
      const unboundDatasetNames = toolWithInputs.selectedDatasets
        .filter((dataset) => !boundDatasetIds.includes(dataset.datasetId))
        .map((dataset) => dataset.name);

      return {
        valid: false,
        message:
          unboundDatasetNames.length +
          " selected files could not be assigned as job input files",
      };
    }
  }

  /**
   * For now, don't worry about the content of the phenodata
   *
   * @param phenodataBindings
   *
   */
  validatePhenodata(phenodataBindings: PhenodataBinding[]): boolean {
    // every returns true for an empty array
    return phenodataBindings.every(
      (binding) =>
        binding.toolInput.optional ||
        (!binding.toolInput.optional && binding.dataset != null)
    );
  }

  validateRunForEach(
    toolWithInputs: SelectedToolWithInputs,
    sessionData: SessionData
  ): ValidationResult {
    if (!toolWithInputs.tool) {
      return { valid: false, message: "Tool missing." };
    } else if (toolWithInputs.tool.inputs.length < 1) {
      return { valid: false, message: "Tool takes no inputs." };
    } else if (
      toolWithInputs.tool.inputs.filter(
        (toolInput) => !toolInput.optional && !toolInput.meta
      ).length > 1
    ) {
      return {
        valid: false,
        message: "Not possible for tools that require more than one inputs.",
      };
    } else if (
      toolWithInputs.selectedDatasets == null ||
      toolWithInputs.selectedDatasets.length < 1
    ) {
      return { valid: false, message: "No files selected." };
    } else if (
      toolWithInputs.selectedDatasets == null ||
      toolWithInputs.selectedDatasets.length === 1
    ) {
      return {
        valid: false,
        message: "Only one file selected.",
      };
    } else {
      const validatedToolsForEachFile: ValidatedTool[] =
        toolWithInputs.selectedDatasets.map((dataset) =>
          this.rebindWithNewDatasetsAndValidate(
            [dataset],
            toolWithInputs,
            sessionData
          )
        );

      const allValid = validatedToolsForEachFile.every(
        (validatedTool) => validatedTool.singleJobValidation.valid
      );

      if (allValid) {
        return { valid: true };
      } else {
        const failCount = validatedToolsForEachFile.filter(
          (validatedTool) => !validatedTool.singleJobValidation.valid
        ).length;

        return {
          valid: false,
          message:
            "Parameter or input checks failed for " +
            UtilsService.getCountAndUnit(failCount, "file"),
        };
      }
    }
  }

  validateRunForEachSample(
    toolWithInputs: SelectedToolWithInputs,
    sampleGroups: SampleGroups,
    sessionData: SessionData
  ): ValidationResult {
    if (!toolWithInputs.tool) {
      return { valid: false, message: "Tool missing." };
    } else if (toolWithInputs.tool.inputs.length < 1) {
      return { valid: false, message: "Tool takes no inputs." };
    } else if (toolWithInputs.selectedDatasets.length === 0) {
      return { valid: false, message: "No files selected." };
    } else if (toolWithInputs.selectedDatasets.length === 1) {
      // prevents unnecessary dropdown run button when only one single end file is selected
      return {
        valid: false,
        message: "Only one file selected.",
      };
    }

    if (
      sampleGroups.singleEndSamples.length < 1 &&
      sampleGroups.pairedEndSamples.length < 1 &&
      sampleGroups.pairMissingSamples.length < 1
    ) {
      // no sample info available
      return {
        valid: false,
        message:
          "Selected files don't include any files defined as sample files.",
      };
    } else if (
      sampleGroups.singleEndSamples.length > 0 &&
      (sampleGroups.pairedEndSamples.length > 0 ||
        sampleGroups.pairMissingSamples.length > 0)
    ) {
      // both single and paired
      return {
        valid: false,
        message:
          "Selected files should only contain single end or paired end sample files, not both.",
      };
    } else if (sampleGroups.pairMissingSamples.length > 0) {
      // only paired, but some pairs missing
      return {
        valid: false,
        message:
          "Selected files contain paired end sample files which are missing their pair file.",
      };
    } else {
      // create validatedTools for each sample
      const validatedToolsForSamples = this.getValidatedToolForEachSample(
        toolWithInputs,
        sampleGroups,
        sessionData
      );

      // check that all rebound validatedTools are valid, every returns true for empty array
      const runForEachSampleValid =
        validatedToolsForSamples.length > 0 &&
        validatedToolsForSamples.every(
          (sampleValidatedTool) =>
            sampleValidatedTool.singleJobInputsValidation.valid
        );

      const failCount: number = validatedToolsForSamples.filter(
        (validatedTool) => !validatedTool.singleJobValidation.valid
      ).length;

      return {
        valid: runForEachSampleValid,
        message: runForEachSampleValid
          ? undefined
          : "Parameter or input checks failed for " +
            UtilsService.getCountAndUnit(failCount, "sample"),
      };
    }
  }

  getValidatedToolForEachSample(
    selectedToolWithInputs: SelectedToolWithInputs,
    sampleGroups: SampleGroups,
    sessionData: SessionData
  ): ValidatedTool[] {
    // all sample datasets, needed for checks
    const singleEnd: boolean = sampleGroups.singleEndSamples.length > 0;

    const sampleDatasets: Dataset[] = singleEnd
      ? this.datasetService.getSingleEndDatasets(sampleGroups.singleEndSamples)
      : this.datasetService.getPairedDatasets(sampleGroups.pairedEndSamples);

    // get selected datasets which are not included in the sample groups
    const sampleDatasetIds = sampleDatasets.map((dataset) => dataset.datasetId);
    const nonSampleDatasets = selectedToolWithInputs.selectedDatasets.filter(
      (dataset) => !sampleDatasetIds.includes(dataset.datasetId)
    );

    // TODO sanity check if nonSampleDatasets have datasets that look like sample datasets?
    // checking prefix maybe not exact enough?
    // const sampleDatasetPrefix = UtilsService.getCommonPrefix(
    //   sampleDatasets.map((dataset) => dataset.name)
    // );

    // for each sample, create new ValidatedTool
    const validatedToolsForSamples = singleEnd
      ? sampleGroups.singleEndSamples.map((singleEndSample) =>
          this.rebindWithNewDatasetsAndValidate(
            this.datasetService
              .getSingleEndDatasets([singleEndSample])
              .concat(nonSampleDatasets),
            selectedToolWithInputs,
            sessionData,
            singleEndSample.sampleName
          )
        )
      : sampleGroups.pairedEndSamples.map((pairedEndSample) =>
          this.rebindWithNewDatasetsAndValidate(
            this.datasetService
              .getPairedDatasets([pairedEndSample])
              .concat(nonSampleDatasets),
            selectedToolWithInputs,
            sessionData,
            pairedEndSample.sampleName
          )
        );

    // // debug pring
    // validatedToolsForSamples.forEach((sampleValidatedTool) => {
    //   console.log("sample validated tool", sampleValidatedTool);
    //   console.log("sample valid: ", sampleValidatedTool.valid);
    //   sampleValidatedTool.inputBindings.forEach((inputBinding) => {
    //     console.log(
    //       inputBinding.toolInput.name.id +
    //         " -> " +
    //         inputBinding.datasets[0]?.name
    //     );
    //   });
    // });

    return validatedToolsForSamples;
  }

  /**
   * Get a copy of the ValidatedTool with the given datasets used for bindings and validations.
   *
   * @param datasets
   * @param originalToolWithInputs
   * @param sessionData
   * @param sampleName
   * @returns
   */
  rebindWithNewDatasetsAndValidate(
    datasets: Dataset[],
    originalToolWithInputs: SelectedToolWithInputs,
    sessionData: SessionData,
    sampleName?: string
  ): ValidatedTool {
    const newSelectedTool: SelectedTool = {
      tool: originalToolWithInputs.tool,
      category: originalToolWithInputs.category,
      module: originalToolWithInputs.module,
    };

    // bind inputs
    const newInputBindings = this.toolService.bindInputs(
      sessionData,
      newSelectedTool.tool,
      datasets
    );

    const newToolWithInputs: SelectedToolWithInputs = Object.assign(
      {
        inputBindings: newInputBindings,
        selectedDatasets: datasets, // TODO should this be only those included in the bindings?
      },
      newSelectedTool
    );

    // validate inputs
    const inputsValidation: ValidationResult =
      this.validateInputs(newToolWithInputs);
    const inputsValid = inputsValidation.valid;
    const inputsMessage = inputsValidation.message;

    // don't try to bind and validate phenodata unless inputs are valid
    // NOTE: input could be valid if they are all optional, and no data selected
    // now bindPhenodata results as empty binding -> phenodata will be invalid
    // which maybe is correct?
    const phenodataBindings = inputsValid
      ? this.toolService.bindPhenodata(newToolWithInputs)
      : this.toolService.getUnboundPhenodataBindings(newToolWithInputs);

    const phenodataValid = inputsValid
      ? this.validatePhenodata(phenodataBindings)
      : false;

    // phenodata validation message, here for now
    let phenodataMessage = "";
    if (!phenodataValid) {
      if (!inputsValid) {
        phenodataMessage = "Inputs need to be valid to determine phenodata";
      } else if (phenodataBindings.length > 1) {
        phenodataMessage =
          "Tool with multiple phenodata inputs not supported yet";
      } else {
        phenodataMessage = "No phenodata available";
      }
    }

    const newToolWithValidatedInputs: SelectedToolWithValidatedInputs =
      Object.assign(
        {
          singleJobInputsValidation: {
            valid: inputsValid,
            message: inputsMessage,
          },
          phenodataValidation: {
            valid: phenodataValid,
            message: phenodataMessage,
          },
          phenodataBindings: phenodataBindings,
        },
        newToolWithInputs
      );

    // parameters are not populated again as they should remain the same

    // validate parameters
    const newToolWithValidatedParams = this.validateParameters(
      newToolWithValidatedInputs
    );

    // get validated tool
    const newValidatedTool = this.getValidatedTool(
      newToolWithValidatedParams,
      sessionData,
      false
    );

    return newValidatedTool;
  }

  getValidationMessage(
    parametersValid: boolean,
    toolWithValidatedInputs: SelectedToolWithValidatedInputs
  ): string {
    const inputsValid = toolWithValidatedInputs.singleJobInputsValidation.valid;
    const inputsMessage =
      toolWithValidatedInputs.singleJobInputsValidation.message;
    const phenodataValid = toolWithValidatedInputs.phenodataValidation.valid;

    if (!parametersValid && !inputsValid) {
      return "Invalid parameters. " + inputsMessage;
    } else if (!parametersValid && !phenodataValid) {
      return "Invalid parameters and missing phenodata.";
    } else if (!parametersValid) {
      return "Invalid parameters.";
    } else if (!inputsValid) {
      return inputsMessage;
    } else if (!phenodataValid) {
      return "Missing phenodata.";
    } else {
      return "";
    }
  }

  private setColumnSelectionParameterValueAfterPopulate(
    parameter: ToolParameter
  ): void {
    // set value to null if previous not an option
    if (
      parameter.value != null &&
      !this.toolService.selectionOptionsContains(
        parameter.selectionOptions,
        parameter.value
      )
    ) {
      parameter.value = null;
    }

    // set to default if null and default an option
    // could be null because it was already null, or it was reset above because previous not an option
    if (parameter.value == null) {
      const defaultValue = this.toolService.getDefaultValue(parameter);
      if (
        this.toolService.selectionOptionsContains(
          parameter.selectionOptions,
          defaultValue
        )
      ) {
        parameter.value = defaultValue;
      }
    }
  }
}
