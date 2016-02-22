/**
 * @desc Controllers that deals with Session Rest calls and post job and other
 *       session related details
 * @example <div ng-controller="SessionCtrl"></div>
 */
chipsterWeb
    .controller(
        'SessionCtrl',
        function ($scope, $routeParams, $q, TemplateService,
                  SessionRestangular, AuthenticationService, $websocket,
                  $http, $window, WorkflowGraphService,
                  baseURLString, $filter) {

            // SessionRestangular is a restangular object with
            // configured baseUrl and
            // authorization header

            $scope.sessionUrl = SessionRestangular.one('sessions',
                $routeParams.sessionId);

            // creating a websocket object and start listening for the
            // events

            var eventUrl = $scope.sessionUrl.getRestangularUrl()
                .replace('http://', 'ws://')
                .replace('https://', 'wss://')
                .replace('/sessiondb/sessions/', '/sessiondbevents/events/');


            console.log(eventUrl);

            var ws = $websocket.$new({
                url: eventUrl + "?token=" + AuthenticationService.getToken(), protocols: []
            });

            ws.$on('$open', function () {
                console.log('websocket connected');
                $scope.wsKeepaliveTimer = setInterval( function() {
                    //ws.$emit('ping');
                }, 5000);

            }).$on('$message', function(event) {

                console.log('websocket event');
                console.log(event);

                if (event.type === 'UPDATE' && event.resourceType === 'DATASET') {
                    //FIXME updates now only the selected dataset
                    if (event.resourceId === $scope.dataNode.datasetId) {
                        $scope.sessionUrl.one('datasets', event.resourceId).get().then( function(resp) {
                            $scope.dataNode.metadata = resp.data.metadata;
                        });
                    }
                }

            }).$on('$close',function(){
                console.log('websocket closed');
                clearInterval($scope.wsKeepaliveTimer);
            });


            // creating a session model object
            $scope.session = {
                sessionId: $routeParams.sessionId,
                sessionName: "",
                sessionDetail: "",
                jobsMap: new Map(),
                datasetsMap: new Map(),
                workflowData: {}
            };


            // For tabbed view manipulation
            $scope.item = 1;
            $scope.setItem = function (value) {
                $scope.item = value;
            };

            $scope.isSet = function (value) {
                return $scope.item === value;
            };

            $scope.d3Data = {
                nodes: [],
                links: []
            };
            $scope.filterNodes = [];

            // Dataset and tool for posting jobs
            $scope.selectedDatasets = [];
            $scope.selectedToolId = null;
            $scope.selectedToolIndex = -1;
            $scope.istoolselected = false;

            // Dataset Detail showing
            $scope.dataNode = null;
            $scope.isDataNodeSelected = false;

            $scope.toolDetailList = null;

            // For searching dataset in workflowgraph
            $scope.searched_dataset_name = null;


            $scope.loadSession = function () {
                // get session detail
                var promises = [
                    $scope.sessionUrl.get(),
                    $scope.sessionUrl.all('datasets').getList(),
                    $scope.sessionUrl.all('jobs').getList()];

                $q.all(promises).then(function (res) {

                    var session = res[0].data;
                    var datasets = res[1].data;
                    var jobs = res[2].data;

                    // store session properties
                    $scope.session.sessionName = session.name;
                    $scope.session.sessionDetail = session.notes;

                    // store datasets
                    var datasetsMap = new Map();
                    datasets.forEach(function (dataset) {
                        datasetsMap.set(dataset.datasetId, dataset);
                    });
                    $scope.session.datasetsMap = datasetsMap;

                    // store jobs
                    var jobsMap = new Map();
                    jobs.forEach(function (job) {
                        jobsMap.set(job.jobId, job);
                    });
                    $scope.session.jobsMap = jobsMap;


                    // create links

                    // assign indexes to datasets
                    angular.forEach(datasets, function (dataset, index) {
                        dataset.index = index;
                    });

                    // links
                    var links = [];
                    datasets.forEach(function (targetDataset) {
                        if (!targetDataset.sourceJob) {
                            return; // continue
                        }
                        if (!(jobsMap.has(targetDataset.sourceJob))) {
                            console.log("source job of dataset " + targetDataset.name + " not found");
                            return; // continue
                        }
                        var sourceJob = jobsMap.get(targetDataset.sourceJob);
                        // iterate over the inputs of the source job
                        sourceJob.inputs.forEach(function (input) {
                            var sourceDataset = datasetsMap.get(input.datasetId);
                            links.push({
                                source: sourceDataset.index,
                                target: targetDataset.index,
                                value: 4
                            });
                        });
                    });

                    // set groups and levels
                    angular.forEach(datasets, function (elem, index) {
                        elem.group = 1;
                        elem.c_id = 0;
                        elem.level = index;

                    });

                    // store links data
                    $scope.d3Data = {
                        nodes: datasets,
                        links: links
                    };

                });
            };

            $scope.editSession = function () {
                var sessionObj = TemplateService.getSessionTemplate();

                sessionObj.sessionId = $scope.session.sessionId;
                sessionObj.name = $scope.session.sessionName;
                sessionObj.notes = $scope.session.sessionDetail;
                $scope.sessionUrl.customPUT(sessionObj).then(
                    function (res) {
                        console.log(res);
                    });

            };

            $scope.getDataSets = function () {
                $scope.datalist = $scope.sessionUrl.all('datasets')
                    .getList();
            };

            $scope.flowFileAdded = function (file, event, flow) {

                console.log('file added');

                // get a separate target for each file
                flow.opts.target = function (file, chunk, isTest) {
                    return file.chipsterTarget;
                };

                $scope.createDataset(file.name).then(
                    function (dataset) {
                        // create an own target for each file
                        file.chipsterTarget = baseURLString
                            + "filebroker/" + "sessions/"
                            + $routeParams.sessionId
                            + "/datasets/" + dataset.datasetId
                            + "?token="
                            + AuthenticationService.getToken();
                        file.resume();
                    });
                // wait for dataset to be created
                file.pause();

            };

            $scope.flowFileSuccess = function (file, message, flow) {
                // remove completed files from the list
                file.cancel();
            };

            $scope.createDataset = function (name) {
                console.log('create dataset called');
                var d = TemplateService.getDatasetTemplate();

                d.datasetId = null;
                d.name = name;
                console.log($scope.d3Data.nodes.length);
                d.x = WorkflowGraphService.calculateXPos(
                    $scope.d3Data.nodes.length, 0);
                d.y = WorkflowGraphService.calculateYPos(
                    $scope.d3Data.nodes.length, 0);
                d.sourceJob = null;
                console.log(d);
                $scope.d3Data.nodes.push(d);

                return new Promise(function (resolve, reject) {
                    var datasetUrl = $scope.sessionUrl.one('datasets');
                    datasetUrl.customPOST(d).then(
                        function (response) {
                            console.log(response);
                            var location = response
                                .headers('Location');
                            d.datasetId = location.substr(location
                                    .lastIndexOf('/') + 1);
                            console.log($scope.d3Data.nodes);
                            // broadcast the new dataset add event
                            // to update the workflow graph
                            $scope.$broadcast('datasetAdded', {});
                            resolve(d);
                        });
                });
            };

            $scope.deleteDataset = function (datasetObj) {

                // changing the file Id first
                var datasetUrl = $scope.sessionUrl.one('datasets').one(
                    datasetObj.datasetId);
                datasetObj.fileId = TemplateService.getRandomFileID();

                // after that attempting to delete
                datasetUrl.customPUT(datasetObj).then(function (res) {
                    datasetUrl.remove().then(function (res) {
                        console.log(res);
                    });

                });

            };

            $scope.getJob = function (jobId) {
                return $scope.session.jobsMap.get(jobId);
            };


            // Method for submitting the job with tool and dataset
            $scope.runJob = function () {
                if ($scope.selectedDatasets.length < 1) {
                    alert("No dataset selected");
                    return;
                }
                var newJob = TemplateService.getJobTemplate();

                if (!$scope.selectedToolId) {
                    alert("No tool selected");
                    return;
                }

                // Edit the fields with selected parameter
                newJob.toolId = $scope.selectedToolId.tool;
                newJob.toolName = $scope.selectedToolId.name;

                angular.forEach($scope.selectedDatasets, function (elem,
                                                                   index) {
                    var input = TemplateService.getInputTemplate();
                    input.datasetId = elem.datasetId;
                    input.inputId = elem.name;

                    console.log(input);
                    newJob.inputs.push(input);
                });

                var postJobUrl = $scope.sessionUrl.one('jobs');
                $scope.$broadcast('changeNodeCheck', {});

                // Calculate the possible progress node position from
                // the input datasets positions
                var progressNode = WorkflowGraphService
                    .getProgressNode($scope.selectedDatasets);
                console.log(progressNode);
                // Show the running job progress
                var progressLinks = WorkflowGraphService
                    .createDummyLinks($scope.selectedDatasets,
                        progressNode);

                // As progress spinner node, we just need to send the
                // progress node info as other input nodes are already
                // creating the json data for progress showing node and
                // links from the input nodes
                var dummyLinkData = {
                    node: progressNode,
                    dummyLinks: progressLinks
                };

                // Sending event for drawing dummyLinks
                $scope.$broadcast('addDummyLinks', {
                    data: dummyLinkData
                });
                // Sending event for adding progress spinner
                $scope.$broadcast('addProgressBar', {
                    data: progressNode
                });

                // clearing all the dataset and tool selection
                $scope.selectedDatasets = [];
                $scope.selectedToolId = null;
                $scope.selectedToolIndex = -1;
                $scope.istoolselected = false;

                postJobUrl.customPOST(newJob).then(function (response) {
                    console.log(response);
                });

                // when job finished event is received,remove the
                // progressbar
                setTimeout(function () {
                    $scope.$broadcast('removeProgressBar', {});
                }, 10000);

            };

            // Binding datasetId from workflow graph directive
            this.setDatasetSelection = function (datasetId) {
                $scope.selectedDatasets.push(datasetId);
                console.log($scope.selectedDatasets);
            };

            this.cancelDatasetSelection = function (datasetId) {
                var index = $scope.selectedDatasets.indexOf(datasetId);
                $scope.selectedDatasets.splice(index, 1);
            };

            $scope.selectedTool = function (tool, $index) {
                $scope.selectedToolId = tool;
                $scope.selectedToolIndex = $index;
                $scope.istoolselected = true;
            };

            $scope.showToolDescription = function () {
                return $scope.istoolselected;
            };

            $scope.toggleToolSelection = function () {
                $scope.istoolselected = false;
                $scope.selectedToolIndex = 0;
            };

            // implementing right click options for data nodes
            this.renameDataset = function (datasetObj, name) {
                var datasetUrl = $scope.sessionUrl.one('datasets').one(
                    datasetObj.datasetId);
                var renamedObj = angular.copy(datasetObj);
                renamedObj.name = name;

                // console.log(datasetObj);
                datasetUrl.customPUT(renamedObj).then(
                    function (res) {
                        var index = $scope.d3Data.nodes
                            .indexOf(datasetObj);
                        console.log(index);
                        $scope.d3Data.nodes.splice(index, 1,
                            renamedObj);
                        // $scope.loadSession();

                    });
            };

            // for showing dataset detail for the selected node
            this.setSelectedDataNode = function (dataNode) {
                $scope.dataNode = dataNode;
                console.log($scope.dataNode.name);
                $scope.isDataNodeSelected = true;

            };

            $scope.showDatasetDetail = function () {
                return $scope.isDataNodeSelected;
            };

            $scope.orientVert = true;
            $scope.changeOrientation = function () {
                $scope.orientVert = !$scope.orientVert;
                $scope.loadWorkflowData();

            };

            // @ToDO This Method will be included in loadSession()
            // to get the right x,y after rotation, may be the calculation still not very right, need to work on that
            $scope.loadWorkflowData = function () {
                $scope.d3Data.nodes.forEach(function (elem) {
                    if ($scope.orientVert) {
                        elem.x = elem.c_id * 80 + 30;
                        elem.y = elem.level * 40 + elem.group * 40;
                    } else {
                        elem.x = (elem.level - 1) * 80 + 30;
                        elem.y = (elem.c_id * 40 + elem.group * 40)
                            - ((elem.level - 1) * 50);
                        console.log(elem.y);
                    }

                });

            };

            // We are only handling the resize end event, currently only
            // working in workflow graph div
            $scope.$on("angular-resizable.resizeEnd", function (event,
                                                                args) {
                $scope.$broadcast('resizeWorkFlowGraph', {
                    data: args
                });

            });

        });

/**
 * Filter for searching dataset in dataset list view
 */
chipsterWeb.filter('searchDataset', function ($rootScope) {
    return function (arr, searched_dataset_name) {

        if (!searched_dataset_name)
            return arr;

        var result = [];
        angular.forEach(arr,
            function (item) {

                if (item.name.indexOf(searched_dataset_name) !== -1
                    | item.name.toLowerCase().indexOf(
                        searched_dataset_name) !== -1) {
                    result.push(item);
                }
            });
        //Here I am braodcasting the filtered result with rootScope to send it to workflowgraph directive, but there might be
        //a better way to make this communication
        $rootScope.$broadcast('searchDatasets', {data: result});

        return result;
    }

});
