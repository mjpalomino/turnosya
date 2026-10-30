import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IosInstallHelpComponent } from './ui/install-button.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, IosInstallHelpComponent],
  template: '<router-outlet /><app-ios-install-help />',
})
export class App {}
