import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AccountModels } from '../src/client/AccountModels.tsx';
import { ModelsClient } from '../src/client/management.ts';

const account = new ModelsClient(new AbortController().signal);
createRoot(document.getElementById('root')!).render(<AccountModels account={account} />);
