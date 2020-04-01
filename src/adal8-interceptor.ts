import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs/internal/Observable';
import { Adal8Service } from './adal8.service';
import { mergeMap } from 'rxjs/operators';

@Injectable()
export class Adal8Interceptor implements HttpInterceptor {
  
  constructor(private adal8Service: Adal8Service) {
  }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

    // if the endpoint is not registered 
    // or if the header 'skip-adal' is set
    // then pass the request as it is to the next handler
    const resource = this.adal8Service.getResourceForEndpoint(request.url);
    const skipAdal = request.headers.get('skip-adal');
    if (!resource || skipAdal) {
      return next.handle(request);
    }

    // if the user is not authenticated then drop the request
    if (!this.adal8Service.userInfo.authenticated) {
      throw new Error('Cannot send request to registered endpoint if the user is not authenticated.');
    }

    // if the endpoint is registered then acquire and inject token
    return this.adal8Service.acquireToken(resource)
      .pipe(
        mergeMap((token: string) => {
            // clone the request and replace the original headers with
            // cloned headers, updated with the authorization
            const authorizedRequest = request.clone({
              headers: request.headers.set('Authorization', 'Bearer ' + token)
            });

            return next.handle(authorizedRequest);
          }
        )
      );
  }
}
