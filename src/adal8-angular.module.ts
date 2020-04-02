import { Adal8Interceptor } from './adal8-interceptor';
import { Adal8Service } from './adal8.service';
import { Adal8HTTPService } from './adal8-http.service';
import { NgModule } from '@angular/core';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { Adal8Guard } from './adal8.guard';

@NgModule({
  imports: [],
  exports: [
    Adal8Service, Adal8HTTPService, Adal8Interceptor, Adal8Guard
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: Adal8Interceptor,
      multi: true
    }
  ]
})
export class Adal8AngularModule {
}