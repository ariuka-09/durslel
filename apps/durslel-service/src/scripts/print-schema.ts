import { print } from 'graphql';
import { typeDefs } from '../schemas';

const sdl = print(typeDefs);

process.stdout.write(sdl);
