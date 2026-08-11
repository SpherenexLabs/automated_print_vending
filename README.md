# React + Vite

## Canon print-vending kiosk

The kiosk targets the USB-connected Windows queue `Canon MG2500 series Printer` (Canon PIXMA MG2577S).
Install the Canon driver, connect the printer, and start the laptop print agent from PowerShell:

```powershell
.\scripts\start-print-kiosk.ps1
```

The launcher verifies that the Canon queue is available on a USB port, sets it as the Windows default printer, and starts a background Electron agent. Keep its terminal window open. The mobile/deployed React app writes paid jobs to Firebase; the laptop agent claims each ready job atomically, loads its stored file, applies colour, copies, page range, paper size, pages per sheet, and scaling, and prints silently. It then marks the Firebase job as `Printed` or `Print Failed`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
