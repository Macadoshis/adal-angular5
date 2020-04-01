import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/internal/Observable';
import { ActivatedRouteSnapshot, CanActivate, CanActivateChild, RouterStateSnapshot } from '@angular/router';
import { Adal8Service } from './adal8.service';

@Injectable()
export class Adal8Guard implements CanActivate, CanActivateChild {

  constructor(private adal8Service: Adal8Service) {
  }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return this.adal8Service.userInfo.authenticated;
  }

  public canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return this.canActivate(childRoute, state);
  }
}