'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      'Preferences',
      'refreshToken',
      Sequelize.STRING
    );
  },

  down: (queryInterface, Sequelize) => {
    queryInterface.removeColumn(
      'Preferences',
      'refreshToken',
      Sequelize.STRING
    );
  }
};
