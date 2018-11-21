import { Injectable } from "@angular/core";
import { CanActivate, Router } from "@angular/router";
import { AuthenticationService } from "../authentication/authentication-service";
import { Observable } from "rxjs/Observable";
import { ConfigService } from "../../shared/services/config.service";
import { RouteService } from "../../shared/services/route.service";
import { ActivatedRouteSnapshot } from "@angular/router";
import { RouterStateSnapshot } from "@angular/router";
import { TokenService } from "../authentication/token.service";
import log from "loglevel";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private tokenService: TokenService,
    private router: Router,
    private authenticationService: AuthenticationService,
    private configService: ConfigService,
    private routeService: RouteService
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    if (this.tokenService.isTokenValid()) {
      // All these must come from the primary configuration (chipster.yaml) so that
      // the route change can continue. We can't use the final configuraton here, because
      // it waits for the route and we would create a deadlock.
      const observables = [
        this.authenticationService.getUser(),
        this.configService
          .getChipsterConfiguration()
          .map(c => c[ConfigService.KEY_TERMS_OF_USE_AUTHS]),
        this.configService
          .getChipsterConfiguration()
          .map(c => c[ConfigService.KEY_TERMS_OF_USE_VERSION])
      ];

      return Observable.forkJoin(observables)
        .map(res => {
          const user = res[0];
          const askForAuths = res[1];
          const latestVersion = res[2];

          // is approval required for this authenticator
          const approvalRequired = askForAuths.indexOf(user.auth) !== -1;
          // has user already approved the terms of use
          const approved =
            user.termsVersion >= latestVersion && user.termsAccepted != null;

          if (!approvalRequired) {
            return true;
          } else if (approved) {
            log.info("terms of use accepted already");
            return true;
          } else {
            log.info(
              "terms of use must be accepted first",
              ", required for this auth:",
              approvalRequired,
              ", accpeted version:",
              user.termVersion,
              ", latest version:",
              latestVersion,
              ", accepted timestamp:",
              user.termsAccepted
            );
            this.routeService.navigateAbsolute("/terms");
            return false;
          }
        })
        .catch(e => {
          if (e.status === 403) {
            log.info("auth guard got 403, redirecting to login");
          } else {
            log.warn("error in auth guard, redirecting to login");
          }
          this.routeService.redirectToLoginAndBackWithCustomCurrentUrl(
            state.url
          );
          return Observable.of(false);
        });
    } else {
      this.routeService.redirectToLoginAndBackWithCustomCurrentUrl(state.url);

      return Observable.of(false);
    }
  }
}
