import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { InstallHelpComponent } from './ui/install-button.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, InstallHelpComponent],
  template: '<router-outlet /><app-install-help />',
})
export class App {}
