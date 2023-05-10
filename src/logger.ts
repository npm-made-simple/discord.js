import chalk, { ChalkInstance } from 'chalk';

export const tag: Record<string, () => string> = {};

tag.info = () => {
    return chalk.blue('info');
};

export const prefix = (message: string, color: ChalkInstance): string => {
    return `${color(` ${message} `)}`;
};

export const createTag = (name: string, color: ChalkInstance) => {
    tag[name] = () => {
        return color(name.toLowerCase());
    };
};
