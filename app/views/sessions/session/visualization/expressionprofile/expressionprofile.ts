import Dataset from "../../../../../model/session/dataset";
import CSVReader from "../../../../../services/csv/CSVReader";
import CSVModel from "../../../../../services/csv/CSVModel";
import ExpressionProfileService from "./expressionprofile.service";
import Line from "./line";
import Point from "./point";
import Rectangle from "./rectangle";
import Interval from "./interval";

class ExpressionProfile {

    static $inject = ['CSVReader', '$routeParams', '$window'];

    private datasetId: string;
    private d3: any;
    private csvModel: CSVModel;
    private expressionProfileService: ExpressionProfileService;

    constructor(private csvReader: CSVReader,
                private $routeParams: ng.route.IRouteParamsService,
                private $window: ng.IWindowService) {
        this.expressionProfileService = new ExpressionProfileService();
    }

    $onInit() {
        this.d3 = this.$window['d3'];

        this.csvReader.getCSV(this.$routeParams.sessionId, this.datasetId).then( (csvModel: CSVModel) => {
            this.csvModel = csvModel;
            this.drawLineChart(csvModel);
        });
    }

    drawLineChart(csvModel: CSVModel) {
        let expressionprofileWidth = document.getElementById('expressionprofile').offsetWidth;

        let margin = {top: 10, right: 10, bottom: 150, left: 40};
        let size = { width: expressionprofileWidth, height: 600};

        let graphArea = {
            width: size.width - margin.left - margin.right,
            height: size.height - margin.top - margin.bottom
        };

        let svg = d3.select('#expressionprofile')
            .append('svg')
            .attr('width', size.width)
            .attr('height', size.height)
            .attr('id', 'svg')
            .style('margin-top', margin.top + 'px');


        let headers = csvModel.getChipHeaders();
        let color = d3.scale.category20();

        // X-axis and scale
        // Calculate points (in pixels) for positioning x-axis points
        let chipRange = _.map(headers, (item, index) => (graphArea.width / headers.length) * index );
        let xScale = d3.scale.ordinal().range(chipRange).domain(headers);
        let xAxis = d3.svg.axis().scale(xScale).orient('bottom').ticks(headers.length);
        svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(' + margin.left + ',' + graphArea.height + ')')
            .call(xAxis)
            .selectAll("text")
            .attr('transform', 'rotate(-65 0 0)')
            .style('text-anchor', 'end');


        // Y-axis and scale
        let yScale = d3.scale.linear().range([graphArea.height, 0]).domain([csvModel.domainBoundaries.min, csvModel.domainBoundaries.max]);
        let yAxis = d3.svg.axis().scale(yScale).orient('left').ticks(5);
        svg.append('g')
            .attr('class', 'y axis')
            .attr('transform', 'translate(' + margin.left + ',0 )')
            .call(yAxis);


        // Linear x-axis to determine selection-rectangle position scaled to csv-data
        let linearXScale = d3.scale.linear().range([0, graphArea.width - (graphArea.width / headers.length)]).domain([0, headers.length - 1]);
        let xIndexAxis = d3.svg.axis().scale(linearXScale).orient('top').ticks(headers.length);
        svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(' + margin.left + ',' + graphArea.height + ')')
            .call(xIndexAxis);
        
        
        console.log('pixels for linear x-axis', linearXScale(0), linearXScale(1));

        // Paths
        let pathsGroup = svg.append("g").attr('id', 'pathsGroup').attr('transform', 'translate(' + margin.left + ',0)');
        let lineGenerator = d3.svg.line()
            .x( (d,i) => xScale( headers[i]) )
            .y( d => yScale(d) );
        let paths = pathsGroup.selectAll('.path')
            .data(_.filter(csvModel.body, (row, i) => i % 160 === 0))
            .enter()
            .append('path')
            .attr('class', 'path')
            .attr('id', (d,i) => 'path' + d[0])
            .attr('d', (d) => lineGenerator( csvModel.getItemsByIndexes(csvModel.chipValueIndexes, d) ) )
            .attr('fill', 'none')
            .attr('stroke-width', 1)
            .attr('stroke', (d, i) => {
                let colorIndex = _.floor( (i / csvModel.body.length) * 20);
                return color(i)
            });

        // Dragging
        let drag = d3.behavior.drag();
        drag.on("drag", onDrag);
        drag.on("dragend", onDragEnd);

        let dragGroup = svg.append("g").attr('id', 'dragGroup').attr('transform', 'translate(' + margin.left + ',0)');

        let band = dragGroup.append("rect")
            .attr("width", 0)
            .attr("height", 0)
            .attr("x", 0)
            .attr("y", 0)
            .attr("class", "band")
            .attr('id', 'band');

        let bandPos = [-1,-1];
        let zoomOverlay = svg.append("rect")
            .attr("width", graphArea.width)
            .attr("height", graphArea.height)
            .attr("class", "zoomOverlay")
            .call(drag);

        function onDragEnd() {
            let pos = d3.mouse(document.getElementById('dragGroup'));

            // X-axis indexes for intervals the selection rectangle is crossing
            let floor = ExpressionProfileService.getFloor( linearXScale.invert(pos[0]), linearXScale.invert(bandPos[0]) );
            let ceil = ExpressionProfileService.getCeil( linearXScale.invert(pos[0]), linearXScale.invert(bandPos[0]) );
            
            var intervals: Array<Interval> = [];

            // create intervals
            for( let chipValueIndex = floor; chipValueIndex < ceil; chipValueIndex++ ) {
                let lines = ExpressionProfileService.createLines(csvModel, chipValueIndex, linearXScale, yScale);
                let intervalStartIndex = chipValueIndex;
                let point1 = new Point(pos[0], pos[1]);
                let point2 = new Point(bandPos[0], bandPos[1]);
                let rectangle = new Rectangle(point1.x, point1.y, point2.x, point2.y);
                intervals.push(new Interval(intervalStartIndex, lines, rectangle));
            }


            _.forEach(intervals, interval => {
                let intersectingLines = _.filter(interval.lines, line => {
                    return ExpressionProfileService.isIntersecting(line, interval.rectangle);
                });

                let csvIds = _.map(intersectingLines, line => line._csvIndex);

                _.forEach(csvIds, pathId => {
                    console.log(pathId);
                    d3.select('#path' + pathId).attr('stroke-width', 5);
                })
            });




            bandPos = [-1, -1];
        }

        function onDrag() {
            let pos = d3.mouse(document.getElementById('dragGroup'));

            if (pos[0] < bandPos[0]) {
                d3.select(".band").attr("transform", "translate(" + (pos[0]) + "," + bandPos[1] + ")");
            }
            if (pos[1] < bandPos[1]) {
                d3.select(".band").attr("transform", "translate(" + (pos[0]) + "," + pos[1] + ")");
            }
            if (pos[1] < bandPos[1] && pos[0] > bandPos[0]) {
                d3.select(".band").attr("transform", "translate(" + (bandPos[0]) + "," + pos[1] + ")");
            }

            //set new position of band when user initializes drag
            if (bandPos[0] === -1) {
                bandPos = pos;
                d3.select(".band").attr("transform", "translate(" + bandPos[0] + "," + bandPos[1] + ")");
            }


            d3.select(".band").transition().duration(1)
                .attr("width", Math.abs(bandPos[0] - pos[0]))
                .attr("height", Math.abs(bandPos[1] - pos[1]));
        }

    }



}

export default {
    bindings: {
        datasetId: '<',
        src: '<',
        selectedDatasets: '<'
    },
    controller: ExpressionProfile,
    template: '<div id="expressionprofile"></div>'
}