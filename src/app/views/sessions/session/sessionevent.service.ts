import {ConfigService} from "../../../shared/services/config.service";
import {SessionResource} from "../../../shared/resources/session.resource";
import Session from "../../../model/session/session";
import Dataset from "../../../model/session/dataset";
import Job from "../../../model/session/job";
import {Injectable} from "@angular/core";
import {TokenService} from "../../../core/authentication/token.service";
import {SessionData} from "../../../model/session/session-data";
import {Observable, Subject} from "rxjs";
import SessionEvent from "../../../model/events/sessionevent";
import {WebSocketSubject} from "rxjs/observable/dom/WebSocketSubject";
import WsEvent from "../../../model/events/wsevent";
import {ErrorService} from "../../error/error.service";

@Injectable()
export class SessionEventService {

    sessionId: string;

    datasetStream$: Observable<SessionEvent>;
    jobStream$: Observable<SessionEvent>;
    sessionStream$: Observable<SessionEvent>;
    authorizationStream$: Observable<SessionEvent>;
    wsSubject$: WebSocketSubject<WsEvent>;
    localSubject$: Subject<WsEvent>;

    constructor(
      private configService: ConfigService,
      private tokenService: TokenService,
      private sessionResource: SessionResource,
      private errorService: ErrorService){
    }

    unsubscribe() {
        this.wsSubject$.unsubscribe();
    }

    setSessionData(sessionId: string, sessionData: SessionData) {

      this.sessionId = sessionId;

      this.localSubject$ = new Subject();
      let stream = this.localSubject$.publish().refCount();

      this.connect(this.localSubject$);

      this.datasetStream$ = stream
        .filter(wsData => wsData.resourceType === 'DATASET')
        .flatMap(data => this.handleDatasetEvent(data, this.sessionId, sessionData))
        // update type tags before letting other parts of the client know about this change
        .flatMap(sessionEvent => this.updateTypeTags(this.sessionId, sessionEvent, sessionData))
        .publish().refCount();

      this.jobStream$ = stream
        .filter(wsData => wsData.resourceType === 'JOB')
        .flatMap(data => this.handleJobEvent(data, this.sessionId, sessionData))
        .publish().refCount();

      this.sessionStream$ = stream
        .filter(wsData => wsData.resourceType === 'SESSION')
        .flatMap(data => this.handleSessionEvent(data, this.sessionId, sessionData))
        .publish().refCount();

      this.authorizationStream$ = stream
        .filter(wsData => wsData.resourceType === 'AUTHORIZATION')
        .flatMap(data => this.handleAuthorizationEvent(data, sessionData))
        .publish().refCount();

      // update sessionData even if no one else subscribes
      this.datasetStream$.subscribe();
      this.jobStream$.subscribe();
      this.sessionStream$.subscribe();
      this.authorizationStream$.subscribe();
    }

  /**
   * Connect to websocket and copy events to the listener Subject
   *
   * There are two Subjects, the listener Subject and
   * the real websocket Subject. The listener Subject collects the subscriptions, while the websocket
   * Subject is kept hidden behing the scenes. All received websocket messages are pushed to the listener
   * Subject. When the websocket Subject completes beause of the server's
   * idle timeout, we can simply create a new websocket Subject, without loosing the current subscriptions.
   */
  connect(listener) {
      // get the url of the websocket server
      this.configService.getSessionDbEventsUrl(this.sessionId).flatMap( (eventsUrl:string) => {

        let wsUrl = `${eventsUrl}/events/${this.sessionId}?token=${this.tokenService.getToken()}`;
        console.debug('event URL', wsUrl);

        // convert websocket to observable
        this.wsSubject$ = Observable.webSocket({
          url: wsUrl,
          openObserver: {next: (x) => {
            console.log('websocket open', x);
          }}
        });

        return this.wsSubject$;

      })
        // convert unclean idle timeouts to clean (about 20% of them for unknown reason)
        .catch(err => {
        if (err.code === 1001 && err.reason === 'Idle Timeout') {
          return Observable.empty();
        } else {
          return Observable.throw(err);
        }
      }).subscribe(data => {
        console.log('websocket event', data);
        listener.next(data);
      }, (err) => {
        console.log('websocket error', err);
        this.errorService.headerError('Connection lost, please reload the page', false);
      }, () => {
        console.log('websocket closed');
        // reconnect after clean close (server idle timeout)
        this.connect(listener);
      });
    }

  /**
   * Update sessionData and create a stream of old and new values. The old values
   * are useful for detecting changes.
   *
   * @returns {Observable<SessionEvent>}
   */
  getDatasetStream() {
        return this.datasetStream$;
    }

    getJobStream() {
        return this.jobStream$;
    }

    getSessionStream() {
      return this.sessionStream$;
    }

    getAuthorizationStream() {
      return this.authorizationStream$;
    }

    createEvent(event, oldValue, newValue) {
        return Observable.of(new SessionEvent(event, oldValue, newValue));
    }

    handleAuthorizationEvent(event: any, sessionData: SessionData): Observable<SessionEvent> {
        if (event.type === 'DELETE') {
            return this.createEvent(event, sessionData.session, null);

        } else {
            console.warn("unknown event type", event);
        }
    }

    handleSessionEvent(event: any, sessionId:any, sessionData: SessionData): Observable<SessionEvent> {
        if (event.type === 'UPDATE') {
           return this.sessionResource.getSession(sessionId).flatMap((remote: Session) => {
                var local = sessionData.session;
                sessionData.session = remote;
                return this.createEvent(event, local, remote);
            });

        } else {
            console.warn("unknown event type", event);
        }
    }

    handleDatasetEvent(event: any, sessionId: string, sessionData: SessionData): Observable<SessionEvent> {

        if (event.type === 'CREATE') {
          return this.sessionResource.getDataset(sessionId, event.resourceId).flatMap((remote: Dataset) => {
                sessionData.datasetsMap.set(event.resourceId, remote);
                return this.createEvent(event, null, remote);
            });

        } else if (event.type === 'UPDATE') {
          return this.sessionResource.getDataset(sessionId, event.resourceId)
              .flatMap((remote: Dataset) => {
                var local = sessionData.datasetsMap.get(event.resourceId);
                sessionData.datasetsMap.set(event.resourceId, remote);
                return this.createEvent(event, local, remote);
            });

        } else if (event.type === 'DELETE') {
            var localCopy = sessionData.datasetsMap.get(event.resourceId);
            sessionData.datasetsMap.delete(event.resourceId);
            return this.createEvent(event, localCopy, null);

        } else {
            console.warn("unknown event type", event);
        }
    }

    updateTypeTags(sessionId, sessionEvent, sessionData) {
      // update type tags before
      let oldValue = <Dataset>sessionEvent.oldValue;
      let newValue = <Dataset>sessionEvent.newValue;

      if (newValue) {
        // dataset created or updated, update type tags too
        return this.sessionResource.getTypeTagsForDataset(sessionId, newValue).map(typeTags => {
          sessionData.datasetTypeTags.set(newValue.datasetId, typeTags);
          return sessionEvent;
        });
      } else {
        // dataset deleted, type tags can be removed
        sessionData.datasetTypeTags.delete(oldValue.datasetId);
        return Observable.of(sessionEvent);
      }
    }

    handleJobEvent(event: any, sessionId: any, sessionData: SessionData): Observable<SessionEvent> {
        if (event.type === 'CREATE') {
            return this.sessionResource.getJob(sessionId, event.resourceId).flatMap((remote: Job) => {
                sessionData.jobsMap.set(event.resourceId, remote);
                return this.createEvent(event, null, remote);
            });

        } else if (event.type === 'UPDATE') {
            return this.sessionResource.getJob(sessionId, event.resourceId).flatMap((remote: Job) => {
                var local = sessionData.jobsMap.get(event.resourceId);
                sessionData.jobsMap.set(event.resourceId, remote);
                return this.createEvent(event, local, remote);
            });

        } else if (event.type === 'DELETE') {
            var localCopy = sessionData.jobsMap.get(event.resourceId);
            sessionData.jobsMap.delete(event.resourceId);
            return this.createEvent(event, localCopy, null);

        } else {
            console.warn("unknown event type", event.type, event);
        }
    }

  /**
   * Handle a locally generated event just like the real events coming from the websocket.
   *
   * Through this the client can be tricked to show different state from the server. Obviously
   * should be used only for quick hacks.
   *
   * @param event
   */
  generateLocalEvent(event: WsEvent) {
    // incorrect typing? it really is an object, but the compiler wants a string
    this.localSubject$.next(event);
  }
}
