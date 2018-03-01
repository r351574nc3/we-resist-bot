'use strict';

const EncryptedField = require('sequelize-encrypted');
const key = process.env.ENCRYPTION_KEY;


module.exports = (sequelize, DataTypes) => {
  // const encrypted_fields = EncryptedField(sequelize, key);
  var Preferences = sequelize.define('Preferences', {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER
    },
    username: { type: DataTypes.STRING, unique: true },
    upvoteWeight: DataTypes.DECIMAL,
    downvoteWeight: DataTypes.DECIMAL,
    threshold: DataTypes.DECIMAL,
    wif: DataTypes.STRING,
    refreshToken: DataTypes.STRING
  }, {
    classMethods: {
      associate: function(models) {
        // associations can be defined here
      }
    }
  });
  return Preferences;
};